import { stripe } from "./lib/stripe";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function check() {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
    for (const ep of endpoints.data) {
        console.log(`URL: ${ep.url}`);
        console.log(`Connect App ID: ${ep.application}`);
    }
}
check().catch(console.error);
