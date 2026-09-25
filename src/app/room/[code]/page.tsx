import type { Metadata } from "next";
import { RoomClient } from "@/components/room/room-client";

export async function generateMetadata({ params }: PageProps<"/room/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: `Room ${code.toUpperCase()}` };
}

export default async function RoomPage({ params }: PageProps<"/room/[code]">) {
  const { code } = await params;
  return <RoomClient code={code.toUpperCase().slice(0, 6)} />;
}
