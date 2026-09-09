import Link from "next/link";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {copy.notFound.title}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {copy.notFound.body}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-[13px] text-accent underline underline-offset-2"
        >
          {copy.notFound.back}
        </Link>
      </div>
    </main>
  );
}
