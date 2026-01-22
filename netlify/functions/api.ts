import serverless from 'serverless-http';
import { createApp } from '../../backend/src/index';

const app = createApp();
export const handler = serverless(app);
