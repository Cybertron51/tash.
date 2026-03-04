import { stripe } from "./lib/stripe";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function listDocs() {
    const accountId = "acct_1T74NJGY7ibaLimx";

    const events = await stripe.events.list({
        limit: 5,
    });

    console.log(`Global Events:`);
    for (const event of events.data) {
        console.log(`Event ${event.id} (${event.type}) at ${new Date(event.created * 1000).toISOString()}`);
        console.log(`  Connected Account ID: ${event.account}`);
    }
}

listDocs().catch(console.error);
