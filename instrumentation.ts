/**
 * Arize AX tracing for a Next.js + Vercel AI SDK app.
 *
 * Verified against the Arize Vercel-AI-SDK integration doc:
 *   https://arize.com/docs/ax/integrations/ts-js-agent-frameworks/vercel
 *
 * Next.js auto-loads this file's `register()` on boot. `@vercel/otel` handles
 * flushing spans in Vercel's serverless/edge runtimes (important — a raw
 * NodeTracerProvider would drop spans when the function returns).
 *
 * To (re)generate or verify this against the current docs, run the magical path:
 *   "Follow the instructions from https://arize.com/docs/PROMPT.md" (the arize-instrumentation skill)
 */
import { registerOTel } from "@vercel/otel";
import {
  OpenInferenceSimpleSpanProcessor,
  isOpenInferenceSpan,
} from "@arizeai/openinference-vercel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";

const projectName = process.env.ARIZE_PROJECT_NAME ?? "acv-hackathon-agent";

export function register() {
  registerOTel({
    serviceName: projectName,
    // REQUIRED: Arize rejects spans without a project-name resource attribute
    // (service.name alone is NOT enough). The OpenInference canonical key is
    // `openinference.project.name` (SEMRESATTRS_PROJECT_NAME); also set `model_id` as a fallback.
    attributes: {
      [SEMRESATTRS_PROJECT_NAME]: projectName,
      model_id: projectName,
    },
    spanProcessors: [
      new OpenInferenceSimpleSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: process.env.ARIZE_OTLP_ENDPOINT ?? "https://otlp.arize.com/v1/traces",
          headers: {
            "arize-space-id": process.env.ARIZE_SPACE_ID ?? "",
            "arize-api-key": process.env.ARIZE_API_KEY ?? "",
          },
        }),
        // Only export OpenInference (LLM/agent) spans, not Next's internal HTTP spans.
        spanFilter: isOpenInferenceSpan,
      }),
    ],
  });
}
