/**
 * Live market data for the tokens currently on the board.
 *
 * The snapshot decides *which* tokens matter and carries their on-chain facts,
 * but it only runs every few minutes — too slow for a price. Those move
 * constantly, and refreshing just them is two requests, so the board polls this
 * and keeps its numbers current between snapshots.
 */
import { NextResponse } from "next/server";
import { dexBatch } from "@/lib/data/onchain";

export const revalidate = 20;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_ADDRESSES = 90;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => ADDRESS.test(s)),
    ),
  ].slice(0, MAX_ADDRESSES);

  if (!ids.length) return NextResponse.json({ prices: {} });

  try {
    const market = await dexBatch(ids);
    const prices: Record<string, unknown> = {};
    for (const [addr, m] of Object.entries(market)) {
      prices[addr] = {
        priceUsd: m.price,
        changePct: m.change,
        volumeUsd: m.volume,
        liquidityUsd: m.liquidity,
        marketCapUsd: m.mcap,
      };
    }
    return NextResponse.json({ prices, at: Date.now() });
  } catch {
    // A failed refresh just means the board keeps the numbers it already has.
    return NextResponse.json({ prices: {} }, { status: 200 });
  }
}
