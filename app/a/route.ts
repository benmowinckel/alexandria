const RETIRED = 'This executable install route is retired. Open https://alexandria-library.com/start and give its non-executable setup message to your coding agent.\n';

export function GET() {
  // curl -f treats 410 as failure and emits no body into a downstream shell.
  return new Response(RETIRED, {
    status: 410,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
