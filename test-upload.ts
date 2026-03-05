import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const fileBuffer = fs.readFileSync("scripts/tashseedcards/55426470.jpg");
    const { data, error } = await supabaseAdmin.storage.from("scans").upload(`test-55426470.jpg`, fileBuffer, {
        contentType: "image/jpeg", upsert: true
    });
    console.log("Result:", data, error);
}
run();
