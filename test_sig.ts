import dotenv from "dotenv";

dotenv.config({ path: ".env" });

console.log('STANDARD SECRET:', process.env.STRIPE_WEBHOOK_SECRET);
console.log('CONNECT SECRET:', process.env.STRIPE_CONNECT_WEBHOOK_SECRET);

