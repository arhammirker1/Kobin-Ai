/**
 * app/api/vault/signed-url/route.ts
 *
 * Returns a 1-hour signed URL for a vault item stored in Supabase Storage.
 * Falls back to drive_file_url for legacy Google Drive items.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const itemId = searchParams.get("item_id")
        if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 })

        const { data: item } = await supabaseAdmin
            .from("vault_items")
            .select("storage_path, drive_file_url, founder_id")
            .eq("id", itemId)
            .single()

        if (!item) return NextResponse.json({ url: null }, { status: 404 })

        if (item.storage_path) {
            const { data, error } = await supabaseAdmin.storage
                .from("vault")
                .createSignedUrl(item.storage_path, 3600)

            if (error || !data?.signedUrl) {
                return NextResponse.json({ url: null }, { status: 500 })
            }
            return NextResponse.json({ url: data.signedUrl })
        }

        // Legacy Drive item
        if (item.drive_file_url) {
            return NextResponse.json({ url: item.drive_file_url })
        }

        return NextResponse.json({ url: null })
    } catch (err: any) {
        console.error("[signed-url]", err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}