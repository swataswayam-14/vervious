import { connect, type NatsConnection, JSONCodec, StringCodec, type Subscription } from "nats";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

export class NatsClient extends EventEmitter {
    private connection: NatsConnection | null = null;
    private jsonCodec = JSONCodec();
    private subscriptions: Map<string, Subscription> = new Map();
    private isConnected = false;

    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectInterval = 5000;

    constructor(private servers: string[] = ['nats://localhost:4222']) {
        super();
    }

    async connect(): Promise<void> {
        try {
            logger.info('Connecting to NATS server', this.servers);

            this.connection = await connect({
                servers: this.servers,
                reconnect: true,
                maxReconnectAttempts: this.maxReconnectAttempts,
                reconnectTimeWait: this.reconnectInterval,
                timeout: 10000,
            });

            this.isConnected = true;
            this.reconnectAttempts = 0;

            logger.info('Connected to NATS');


            this.connection.closed().then(() => {
                logger.info('NATS connection closed');
                this.isConnected = false;
                this.emit('disconnect');
            });

            this.emit('connect');
        } catch (error) {
            logger.error('Failed to connect to NATS', error);

            if(this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                logger.info(`Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                setTimeout(()=> this.connect(), this.reconnectInterval);
            } else {
                this.emit('error', error);
            }
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if(this.connection) {
            for(const[subject, subscription] of this.subscriptions) {
                subscription.unsubscribe();
                logger.info(`Unsubscribed from ${subject}`);
            }
            this.connection = null;
            this.isConnected = false;
            logger.info('Disconnected from NATS');
        }
    }

    isConnectionActive():boolean {
        return this.isConnected && this.connection != null;
    }

    async publish(subject: string, data: any): Promise<void> {
        if(!this.connection) throw new Error('Nats connection not established');

        try {
            const encodedData = this.jsonCodec.encode({
                ...data,
                messageId: data.messageId || uuidv4(),
                timestamp: data.timestamp || new Date(),
            });
            this.connection.publish(subject, encodedData);
            logger.info(`Published message to subject: ${subject}`);
        } catch (error) {
            logger.error(`Failed to publish to subject ${subject}: `, error)
            throw error;
        }
    }
    async request<TRequest, TResponse> (
        subject: string,
        data: TRequest,
        timeout: number = 5000
    ): Promise<TResponse> {
        if(!this.connection) {
            throw new Error('Nats connection not established');
        }

        try {
            const requestData = {
                ...data,
                messageId: (data as any).messageId || uuidv4(),
                timestamp: (data as any).timestamp || new Date(),
            };
            const encodedData = this.jsonCodec.encode(requestData);
            const response = await this.connection.request(subject, encodedData, {timeout});

            const decodedResponse = this.jsonCodec.decode(response.data) as TResponse;
            logger.info(`Recieved response from subject: ${subject}`);

            return decodedResponse;
        } catch (error) {
            logger.error(`Failed to request from subject ${subject}`, error);
            throw error;
        }
    }

    async subscribe<T> (
        subject: string,
        callback: (data: T, subject: string, reply?: string) => Promise<void> | void,
        options?: {queue: string}
    ): Promise<void> {
        if(!this.connection) {
            throw new Error('Nats connection not established');
        }

        try {
            const subscription = this.connection.subscribe(subject, options);
            this.subscriptions.set(subject, subscription);

            logger.info(`Subscribed to subject: ${subject}${options?.queue ? ` (queue: ${options.queue})` : ''}`);

            (async () => {
                for await (const message of subscription) {
                    try {
                        const decodedData = this.jsonCodec.decode(message.data) as T;
                        logger.info(`Received message from subject: ${subject}`)
                        await callback(decodedData, message.subject, message.reply);
                    } catch (error) {
                        logger.error(`Error processing message from subject ${subject}:`, error);
                    }
                }
            })
        } catch (error) {
            logger.error(`Failed to subscribe to subject ${subject}:`, error);
        }
    }
  async subscribeRequestReply<TRequest, TResponse>(
    subject: string,
    handler: (data: TRequest) => Promise<TResponse> | TResponse,
    options?: { queue?: string }
  ): Promise<void> {
    if (!this.connection) {
      throw new Error('NATS connection not established');
    }

    try {
      const subscription = this.connection.subscribe(subject, options);
      this.subscriptions.set(subject, subscription);

      console.log(`Subscribed to request-reply subject: ${subject}${options?.queue ? ` (queue: ${options.queue})` : ''}`);

      (async () => {
        for await (const message of subscription) {
          try {
            const requestData = this.jsonCodec.decode(message.data) as TRequest;
            console.log(`Received request from subject: ${subject}`);

            const response = await handler(requestData);
            
            if (message.reply) {
              const responseData = {
                ...response,
                messageId: uuidv4(),
                timestamp: new Date(),
                correlationId: (requestData as any).messageId,
              };
              
              message.respond(this.jsonCodec.encode(responseData));
              console.log(`Sent response to subject: ${message.reply}`);
            }
          } catch (error) {
            console.error(`Error handling request from subject ${subject}:`, error);
            
            if (message.reply) {
              const errorResponse = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                messageId: uuidv4(),
                timestamp: new Date(),
              };
              
              message.respond(this.jsonCodec.encode(errorResponse));
            }
          }
        }
      })();
    } catch (error) {
      console.error(`Failed to subscribe to request-reply subject ${subject}:`, error);
      throw error;
    }
  }

  async unsubscribe(subject: string): Promise<void> {
    const subscription = this.subscriptions.get(subject);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subject);
      console.log(`Unsubscribed from subject: ${subject}`);
    }
  }

  async publishEvent(subject: string, event: any): Promise<void> {
    const eventData = {
      ...event,
      messageId: event.messageId || uuidv4(),
      timestamp: event.timestamp || new Date(),
    };

    await this.publish(subject, eventData);
  }

  getConnection(): NatsConnection | null {
    return this.connection;
  }

  getStats() {
    if (!this.connection) {
      return null;
    }

    return {
      connected: this.isConnected,
      subscriptions: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}



let natsClientInstance: NatsClient | null = null;

export function getNatsClient(servers?: string[]): NatsClient {
  if (!natsClientInstance) {
    natsClientInstance = new NatsClient(servers);
  }
  return natsClientInstance;
}

export async function gracefulShutdown(): Promise<void> {
  if (natsClientInstance) {
    console.log('Shutting down NATS client...');
    await natsClientInstance.disconnect();
    natsClientInstance = null;
  }
}
export async function connectNats(servers?: string[]): Promise<NatsClient> {
  const client = getNatsClient(servers);
  
  if (!client.isConnectionActive()) {
    await client.connect();
  }
  
  return client;
}