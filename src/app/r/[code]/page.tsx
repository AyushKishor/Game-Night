import { redirect } from "next/navigation";

/** Short share link: /r/K7P4XM → join screen. */
export default async function ShortLink({ params, searchParams }: PageProps<"/r/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const handoff = typeof sp.handoff === "string" ? `&handoff=${encodeURIComponent(sp.handoff)}` : "";
  redirect(`/join?code=${encodeURIComponent(code.toUpperCase())}${handoff}`);
}
