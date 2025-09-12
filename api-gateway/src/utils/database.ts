import mongoose, { type ConnectOptions } from 'mongoose';

export class DatabaseConnection {
  private isConnected = false;

  async connect(uri: string, dbName?: string): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const options: ConnectOptions = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      if (dbName) {
        options.dbName = dbName;
      }

      await mongoose.connect(uri, options);

      this.isConnected = true;
      console.log(`Connected to MongoDB: ${dbName || 'default'}`);

      mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('Disconnected from MongoDB');
    }
  }

  isActive(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}
