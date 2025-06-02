import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  loadDocumentFromStore,
  saveDocumentToStore,
} from "@/lib/document-store";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Copy, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { components } from "../../schema";
import DocumentLayout from "../components/document-layout";

async function uploadFile(
  apiUrl: string,
  file: File,
  token: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiUrl}/upload`, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: window.location.origin,
    },
    mode: "cors",
  });

  if (!response.ok) {
    console.error(await response.text());
    throw new Error("Failed to upload file");
  }

  const result = await response.json();
  console.log("file_id:", result.file_id);
  return result.file_id;
}

async function fetchJobStatus(apiUrl: string, jobId: string, token: string) {
  const response = await fetch(`${apiUrl}/job/${jobId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Origin: window.location.origin,
    },
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  const jobStatusResponse = await response.json();
  if (
    jobStatusResponse.status === "Pending" ||
    jobStatusResponse.status === "Idle"
  ) {
    throw new Error(
      `Job ${jobStatusResponse.status}, progress: ${jobStatusResponse.progress}`
    );
  }
  return jobStatusResponse;
}

async function getExtractJobId(
  apiUrl: string,
  fileId: string,
  token: string,
  extractConfig: ExtractConfig
) {
  console.log("document_url:", fileId);
  try {
    const async_response = await fetch(`${apiUrl}/extract_async`, {
      method: "POST",
      body: JSON.stringify({
        ...extractConfig,
        document_url: fileId,
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: window.location.origin,
      },
    });

    if (!async_response.ok) {
      console.error(await async_response.text());
      throw new Error("Failed to start extract job");
    }

    const { job_id } = await async_response.json();
    return job_id;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

type ExtractConfig = {
  options?: components["schemas"]["BaseProcessingOptions"];
  advanced_options?: components["schemas"]["AdvancedProcessingOptions"];
  experimental_options?: components["schemas"]["ExperimentalProcessingOptions"];
  system_prompt?: string;
  schema: unknown;
  generate_citations?: boolean;
  array_extract?: components["schemas"]["ArrayExtractConfig"];
  use_chunking?: boolean;
  priority?: boolean;
};

// Enhanced JSON Schema Builder component with validation indicator
function JsonSchemaBuilder({
  schema,
  onSchemaChange,
}: {
  schema: any;
  onSchemaChange: (schema: any) => void;
}) {
  const [rawSchema, setRawSchema] = useState(
    JSON.stringify(schema || {}, null, 2)
  );
  const [isValid, setIsValid] = useState(true);

  const handleRawSchemaChange = (value: string) => {
    setRawSchema(value);
    try {
      const parsed = JSON.parse(value);
      onSchemaChange(parsed);
      setIsValid(true);
    } catch {
      setIsValid(false);
      // Don't update the schema if JSON is invalid
    }
  };

  // Update raw schema when schema prop changes (for two-way binding)
  useEffect(() => {
    const newRawSchema = JSON.stringify(schema || {}, null, 2);
    if (newRawSchema !== rawSchema) {
      setRawSchema(newRawSchema);
      setIsValid(true);
    }
  }, [schema]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label className="text-lg font-semibold">JSON Schema</Label>
          {isValid ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigator.clipboard.writeText(rawSchema)}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <Textarea
        value={rawSchema}
        onChange={(e) => handleRawSchemaChange(e.target.value)}
        className="font-mono min-h-[300px] text-sm"
        placeholder="Enter your JSON schema here..."
      />
    </div>
  );
}

const defaultExtractConfig: ExtractConfig = {
  options: {
    chunking: {
      chunk_mode: "disabled",
    },
    table_summary: {
      enabled: false,
    },
    figure_summary: {
      enabled: false,
    },
    ocr_mode: "standard",
    extraction_mode: "ocr",
  },
  advanced_options: {
    table_output_format: "html",
    ocr_system: "highres",
  },
  experimental_options: {
    rotate_images: true,
  },
  system_prompt: "Be precise and thorough.",
  generate_citations: false,
  array_extract: {
    enabled: false,
    mode: "legacy",
    pages_per_segment: 10,
    streaming_extract_item_density: 50,
  },
  use_chunking: false,
  priority: true,
  schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The title of the document",
      },
      summary: {
        type: "string",
        description: "A brief summary of the document content",
      },
    },
    required: ["title", "summary"],
  },
};

export default function ExtractPage() {
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [numPages, setNumPages] = useState<number>(0);
  const [apiUrl, setApiUrl] = useState<string>(
    import.meta.env.VITE_API_URL ?? "https://platform.reducto.ai"
  );
  const [apiToken, setApiToken] = useState<string>(
    import.meta.env.VITE_API_TOKEN ?? ""
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [pagination, setPagination] = useState<number>(0);
  const [showBlocks, setShowBlocks] = useState<boolean>(false);
  const [extractConfig, setExtractConfig] =
    useState<ExtractConfig>(defaultExtractConfig);
  const [jsonOutput, setJsonOutput] = useState<
    components["schemas"]["ExtractResponse"] | null
  >(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "result">("config");

  // Load stored document on mount
  useEffect(() => {
    const storedFile = loadDocumentFromStore();
    if (storedFile) {
      setPdfFile(storedFile);
    }
  }, []);

  // Save document to storage when file changes
  useEffect(() => {
    if (pdfFile) {
      saveDocumentToStore(pdfFile);
    }
  }, [pdfFile]);

  // Two-way binding: Update individual fields when extractConfig changes
  const updateSystemPrompt = useCallback((prompt: string) => {
    setExtractConfig((prev) => ({
      ...prev,
      system_prompt: prompt,
    }));
  }, []);

  const updateSchema = useCallback((schema: any) => {
    setExtractConfig((prev) => ({
      ...prev,
      schema,
    }));
  }, []);

  const updateExtractConfigFromJSON = useCallback((configText: string) => {
    try {
      const parsed = JSON.parse(configText);
      setExtractConfig(parsed);
    } catch {
      // Invalid JSON, don't update
    }
  }, []);

  const { data: jobData } = useQuery({
    queryKey: ["extractJobStatus", jobId],
    queryFn: () => fetchJobStatus(apiUrl, jobId!, apiToken),
    enabled: !!jobId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    retry: 15 * 60, // Timeout after 15 minutes
    retryDelay: 1000,
  });

  useEffect(() => {
    if (jobData) {
      if (jobData.status === "Failed") {
        console.error(`Job ${jobId} failed:`, jobData.reason);
      }
      setJsonOutput(jobData.result);
      setLoading(false);
      setJobId(null);
      setActiveTab("result"); // Switch to result tab when done
    }
  }, [jobData, jobId]);

  const onProcessDocument = useCallback(async () => {
    if (pdfFile) {
      setLoading(true);
      try {
        const fileId = await uploadFile(apiUrl, pdfFile, apiToken);
        const jobId = await getExtractJobId(
          apiUrl,
          fileId,
          apiToken,
          extractConfig
        );
        setJobId(jobId);
      } catch (err) {
        setLoading(false);
        alert(err);
      }
    }
  }, [pdfFile, apiUrl, apiToken, extractConfig]);

  const scrollToBboxOrBlock = useCallback(
    (
      chunkIndex: number,
      blockIndex: number,
      isBbox: boolean = true,
      color: string = "gray"
    ) => {
      const blockIds = isBbox
        ? [`bbox_${chunkIndex}_${blockIndex}`]
        : [
            `block_${chunkIndex}_${blockIndex}`,
            `text_block_${chunkIndex}_${blockIndex}`,
          ];

      for (const blockId of blockIds) {
        const element = document.getElementById(blockId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });

          // Add multiple visual effects for better visibility
          const classesToAdd = isBbox
            ? ["bg-opacity-50", "outline-4", "animate-pulse"]
            : [`bg-${color}-500`, "bg-opacity-25", "animate-pulse"];

          element.classList.add(...classesToAdd);

          // Remove classes after animation
          setTimeout(() => {
            element.classList.remove(...classesToAdd);
          }, 2000);
          break;
        }
      }
    },
    []
  );

  const accordionContent = (
    <Tabs defaultValue="api" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger className="w-full" value="api">
          API Configuration
        </TabsTrigger>
        <TabsTrigger className="w-full" value="json">
          Manual JSON Output
        </TabsTrigger>
      </TabsList>

      <TabsContent value="api" className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="api-url">API URL</Label>
            <input
              id="api-url"
              type="text"
              placeholder="https://v1.api.reducto.ai"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-token">API Token</Label>
            <input
              type="password"
              id="api-token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="json" className="pt-4">
        <div className="space-y-2">
          <Label htmlFor="json-input">JSON Input</Label>
          <Textarea
            id="json-input"
            value={JSON.stringify(jsonOutput || {}, null, 2)}
            onChange={(e) => {
              try {
                setJsonOutput(JSON.parse(e.target.value));
              } catch {
                // Invalid JSON, don't update
              }
            }}
            className="w-full font-mono min-h-[40px] h-[40px]"
            placeholder="Paste your JSON here"
          />
        </div>
      </TabsContent>
    </Tabs>
  );

  const rightPanelContent = (
    <div className="h-full flex flex-col">
      {/* Sticky tabs */}
      <div className="flex-none border-b bg-white">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "config" | "result")}
          className="w-full"
        >
          <TabsList className="w-full">
            <TabsTrigger className="w-full" value="config">
              Config
            </TabsTrigger>
            <TabsTrigger className="w-full" value="result">
              Result
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {activeTab === "config" && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="system-prompt"
                    className="text-lg font-semibold"
                  >
                    System Prompt
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        extractConfig.system_prompt || ""
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  id="system-prompt"
                  value={extractConfig.system_prompt || ""}
                  onChange={(e) => updateSystemPrompt(e.target.value)}
                  className="min-h-[40px]"
                  placeholder="Enter your extraction instructions here..."
                />
              </div>

              <JsonSchemaBuilder
                schema={extractConfig.schema}
                onSchemaChange={updateSchema}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="extract-config"
                    className="text-lg font-semibold"
                  >
                    Extract API Config
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        JSON.stringify(extractConfig, null, 2)
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  id="extract-config"
                  className="w-full font-mono min-h-[400px] text-sm"
                  value={JSON.stringify(extractConfig, null, 2)}
                  onChange={(e) => updateExtractConfigFromJSON(e.target.value)}
                />
              </div>
            </div>
          )}

          {activeTab === "result" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="extracted-data"
                  className="text-lg font-semibold"
                >
                  Extracted Data
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      JSON.stringify(jsonOutput, null, 2)
                    )
                  }
                  disabled={!jsonOutput}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {jsonOutput ? (
                <pre
                  id="extracted-data"
                  className="p-4 bg-gray-100 rounded-md text-sm text-wrap"
                >
                  {JSON.stringify(jsonOutput, null, 2)}
                </pre>
              ) : (
                <p>No extraction result available.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DocumentLayout
      title="Reducto Local Document Playground"
      pdfFile={pdfFile}
      setPdfFile={setPdfFile}
      numPages={numPages}
      setNumPages={setNumPages}
      pagination={pagination}
      setPagination={setPagination}
      jsonOutput={null} // Pass null since we're using extract response
      setJsonOutput={() => {}} // No-op since we manage our own state
      loading={loading}
      showBlocks={showBlocks}
      setShowBlocks={setShowBlocks}
      onProcessDocument={onProcessDocument}
      onScrollToBlock={scrollToBboxOrBlock}
      rightPanelContent={rightPanelContent}
      accordionContent={accordionContent}
      citations={jsonOutput?.citations}
    />
  );
}
