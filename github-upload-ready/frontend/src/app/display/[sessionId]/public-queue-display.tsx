"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type DisplayTicket = {
  queueNumber: string;
  status: string;
  counter: { name: string; code: string } | null;
};

type QueueDisplayData = {
  office: { name: string; code: string };
  service: string;
  status: "OPEN" | "PAUSED" | "CLOSED";
  nowServing: DisplayTicket[];
  upNext: string[];
};

export default function PublicQueueDisplay({
  sessionId,
}: {
  sessionId: string;
}) {
  const [queue, setQueue] = useState<QueueDisplayData | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<QueueDisplayData>(
        `/queue/sessions/${encodeURIComponent(sessionId)}/display`,
      );
      setQueue(data);
      setError("");
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The queue display is temporarily unavailable.",
      );
    }
  }, [sessionId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 4000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (queue) {
      document.title = `${queue.office.code} queue display · Campus Queue`;
    }
  }, [queue]);

  return (
    <main className="public-queue-screen">
      <header className="public-queue-header">
        <Link
          className="public-queue-brand"
          href="/"
          aria-label="Campus Queue home"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            campus<span>queue</span>
          </span>
        </Link>
        <div className="public-live-indicator">
          <i /> LIVE QUEUE
        </div>
      </header>

      {queue ? (
        <>
          <section className="public-queue-intro">
            <span className="section-kicker">
              {queue.office.code} <span>·</span> {queue.office.name}
            </span>
            <h1>{queue.service}</h1>
            <div
              className={`public-session-status ${queue.status.toLowerCase()}`}
              aria-live="polite"
            >
              <i />
              {queue.status === "OPEN"
                ? "Queue open"
                : queue.status === "PAUSED"
                  ? "Queue paused"
                  : "Queue closed"}
            </div>
          </section>

          {error && (
            <p className="public-display-warning" role="status">
              {error} Showing the most recent update while reconnecting.
            </p>
          )}

          <section className="public-queue-grid" aria-label="Live queue status">
            <article className="public-now-serving">
              <div className="public-section-label">NOW SERVING</div>
              {queue.nowServing.length ? (
                <div className="public-serving-list" aria-live="polite">
                  {queue.nowServing.map((ticket) => (
                    <div
                      className="public-serving-ticket"
                      key={ticket.queueNumber}
                    >
                      <strong>{ticket.queueNumber}</strong>
                      <div>
                        <span>
                          {ticket.status === "SERVING"
                            ? "Being served"
                            : "Please come forward"}
                        </span>
                        <small>
                          {ticket.counter
                            ? `${ticket.counter.name} · ${ticket.counter.code}`
                            : "Please go to the service desk"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="public-no-current-ticket">
                  <strong>—</strong>
                  <span>No ticket is being called</span>
                </div>
              )}
            </article>

            <article className="public-up-next">
              <div className="public-section-label">UP NEXT</div>
              {queue.upNext.length ? (
                <ol>
                  {queue.upNext.map((number, index) => (
                    <li key={number}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{number}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="public-no-next">
                  There are no tickets waiting.
                </div>
              )}
            </article>
          </section>

          <footer className="public-queue-footer">
            <span>
              Please watch the screen and come forward when your number appears.
            </span>
            <span>
              {updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Connecting…"}
              <button
                type="button"
                onClick={() => void refresh()}
                aria-label="Refresh queue display"
              >
                Refresh
              </button>
            </span>
          </footer>
        </>
      ) : (
        <section className="public-display-empty" aria-live="polite">
          <span className="section-kicker">CAMPUS QUEUE</span>
          <h1>
            {error ? "Queue display unavailable" : "Connecting to queue…"}
          </h1>
          <p>{error || "The live queue will appear here shortly."}</p>
          <button
            type="button"
            className="button-soft"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </section>
      )}
    </main>
  );
}
