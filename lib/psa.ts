import { supabaseAdmin as supabase } from "./supabase-admin";

/**
 * Fetches the primary (front) image for a PSA certification number
 * from the PSA Public API.
 */
export async function fetchPSAImage(certNumber: string): Promise<string | null> {
    const token = process.env.PSA_API_TOKEN;
    if (!token) {
        console.warn("PSA_API_TOKEN is not set, skipping PSA image fetch.");
        return null;
    }

    try {
        const url = `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${certNumber}`;
        console.log(`[PSA Images] GET ${url}`);
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log(`[PSA Images] Response status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            const errorBody = await res.text().catch(() => "<unable to read body>");
            console.error(`[PSA Images] Error response body: ${errorBody}`);
            if (res.status === 404) return null;
            return null;
        }

        const data = await res.json();
        console.log(`[PSA Images] Response data:`, JSON.stringify(data, null, 2));

        if (!Array.isArray(data)) {
            console.warn(`[PSA Images] Expected array, got:`, typeof data);
            return null;
        }

        // Find the front image
        const frontImage = data.find((img: any) => img.IsFront === true);
        console.log(`[PSA Images] Front image URL: ${frontImage?.ImageUrl || "none"}`);
        return frontImage?.ImageUrl || null;
    } catch (error) {
        console.error("[PSA Images] Exception:", error);
        return null;
    }
}

/**
 * Fetches the metadata (Name, Set, Year, Grade) for a PSA certification number
 * from the PSA Public API.
 */
export async function fetchPSAMetadata(certNumber: string): Promise<any | null> {
    const token = process.env.PSA_API_TOKEN;
    if (!token) {
        console.warn("[PSA Metadata] PSA_API_TOKEN is not set, skipping.");
        return null;
    }

    try {
        const url = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`;
        console.log(`[PSA Metadata] GET ${url}`);
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log(`[PSA Metadata] Response status: ${res.status} ${res.statusText}`);

        if (!res.ok) {
            const errorBody = await res.text().catch(() => "<unable to read body>");
            console.error(`[PSA Metadata] Error response body: ${errorBody}`);
            return null;
        }

        const data = await res.json();
        console.log(`[PSA Metadata] Full response:`, JSON.stringify(data, null, 2));

        const cert = data.PSACert;
        if (cert) {
            console.log(`[PSA Metadata] Parsed — Subject: ${cert.Subject}, CardSet: ${cert.CardSet}, Year: ${cert.Year}, Grade: ${cert.CardGrade}, Brand: ${cert.Brand}, Player: ${cert.Player}`);
        } else {
            console.warn(`[PSA Metadata] No PSACert field in response. Keys: ${Object.keys(data).join(", ")}`);
        }
        return cert;
    } catch (error) {
        console.error("[PSA Metadata] Exception:", error);
        return null;
    }
}

/**
 * Downloads an image from a URL and uploads it to the Supabase 'card_images' bucket.
 * Returns the public URL of the uploaded image.
 */
export async function uploadCardImageToStorage(imageUrl: string, certNumber: string): Promise<string | null> {
    try {
        // 1. Download the image into a buffer
        const res = await fetch(imageUrl);
        if (!res.ok) {
            console.error(`Failed to download image from ${imageUrl}: ${res.statusText}`);
            return null;
        }
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (!supabase) {
            console.error("Supabase client is not initialized.");
            return null;
        }

        // 2. Upload to Supabase Storage
        const fileName = `${certNumber}_front.jpg`; // Assuming JPEG from PSA
        const { data, error } = await supabase.storage
            .from("card_images")
            .upload(fileName, buffer, {
                contentType: blob.type || "image/jpeg",
                upsert: true,
            });

        if (error) {
            console.error("Supabase storage upload error:", error);
            return null;
        }

        // 3. Get the public URL
        const { data: publicUrlData } = supabase.storage
            .from("card_images")
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
    } catch (error) {
        console.error("Error in uploadCardImageToStorage:", error);
        return null;
    }
}

/**
 * Uploads a base64 encoded image (the raw camera scan) to the Supabase 'scans' bucket.
 * Returns the public URL of the uploaded image.
 */
export async function uploadRawScanToStorage(base64Data: string, mimeType: string): Promise<string | null> {
    try {
        if (!supabase) {
            console.error("Supabase client is not initialized.");
            return null;
        }

        // Convert base64 to Buffer
        const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Clean, "base64");

        // Generate a random ID for the file name
        const fileId = crypto.randomUUID();
        const extension = mimeType.split('/')[1] || 'jpeg';
        const fileName = `${fileId}.${extension}`;

        const { data, error } = await supabase.storage
            .from("scans")
            .upload(fileName, buffer, {
                contentType: mimeType,
                upsert: true,
            });

        if (error) {
            console.error("Supabase storage upload error for raw scan:", error);
            return null;
        }

        const { data: publicUrlData } = supabase.storage
            .from("scans")
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
    } catch (error) {
        console.error("Error in uploadRawScanToStorage:", error);
        return null;
    }
}

