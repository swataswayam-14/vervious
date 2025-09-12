import { ApiGateway } from "./app.js";

const apiGateway = new ApiGateway();

apiGateway.start().catch(console.error);