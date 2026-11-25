import { MockErp } from './mock-erp';

/** Runs the mock ERP for local development: npm run mock-erp */
const port = Number(process.env.MOCK_ERP_PORT ?? 50000);
new MockErp()
  .start(port)
  .then((url) => console.log(`Mock SAP Business One Service Layer on ${url}  (user: manager / password: demo-only)`));
