import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        // 1. Verify the webhook secret
        const authHeader = request.headers.get("Authorization");
        const webhookSecret = process.env.WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("WEBHOOK_SECRET is not set in environment variables");
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        if (authHeader !== `Bearer ${webhookSecret}`) {
            console.error("WEBHOOK AUTHENTICATION FAILED");
            console.error(`Expected: Bearer ${webhookSecret}`);
            console.error(`Received: ${authHeader}`);
            console.error("Please check the Supabase Webhook HTTP Headers configuration.");

            return NextResponse.json(
                { error: "Unauthorized", details: "Check Vercel Server Logs for token mismatch details." },
                { status: 401 }
            );
        }

        // 2. Parse the payload
        const payload = await request.json();

        // Supabase webhook payload structure for INSERT:
        // { type: "INSERT", table: "profiles", record: { id, email, name, ... }, old_record: null }
        if (payload.type !== "INSERT" || payload.table !== "profiles") {
            return NextResponse.json({ message: "Ignored: not a profile insert" }, { status: 200 });
        }

        const { email, name, id } = payload.record;
        const adminEmail = process.env.ADMIN_EMAIL;

        if (!adminEmail) {
            console.error("ADMIN_EMAIL is not set in environment variables");
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        // 3. Send the email
        console.log(`Sending new user notification to ${adminEmail} for user ${email}`);

        const { data, error } = await resend.emails.send({
            from: "onboarding@resend.dev", // resend.dev allows sending to verified emails for testing
            to: [adminEmail],
            subject: `New User Signup: ${name || email}`,
            html: `
        <h2>New User Registration</h2>
        <p>A new user has just signed up for your application.</p>
        <ul>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Name:</strong> ${name || "Not provided"}</li>
            <li><strong>User ID:</strong> ${id}</li>
        </ul>
        <p>Time of registration: ${new Date().toUTCString()}</p>
      `,
        });

        if (error) {
            console.error("Resend generated an error:", error);
            return NextResponse.json({ error }, { status: 400 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Error processing webhook:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
