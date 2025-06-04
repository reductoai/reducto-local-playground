import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { BotIcon, Copy, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pdfjs } from "react-pdf";
import { match } from "ts-pattern";
import { components } from "../schema";
import DocumentLayout from "./components/document-layout";
import { Textarea } from "./components/ui/textarea";
import { bboxTypeColors } from "./lib/colors";
import {
  loadDocumentFromStore,
  saveDocumentToStore,
} from "./lib/document-store";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

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

async function getJobId(
  apiUrl: string,
  fileId: string,
  token: string,
  apiConfig: ParseConfig
) {
  console.log("document_url:", fileId);
  try {
    const async_response = await fetch(`${apiUrl}/parse_async`, {
      method: "POST",
      body: JSON.stringify({
        ...apiConfig,
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
      throw new Error("Failed to start job");
    }

    const { job_id } = await async_response.json();
    return job_id;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

type ParseConfig = {
  options?: components["schemas"]["BaseProcessingOptions"];
  advanced_options?: components["schemas"]["AdvancedProcessingOptions"];
  experimental_options?: components["schemas"]["ExperimentalProcessingOptions"];
};
const defaultParseConfig: ParseConfig = {
  options: {
    chunking: {
      chunk_mode: "variable",
    },
    table_summary: {
      enabled: false,
    },
    figure_summary: {
      enabled: false,
    },
    ocr_mode: "standard",
    extraction_mode: "hybrid",
  },
  advanced_options: {
    table_output_format: "html",
    ocr_system: "multilingual",
  },
  experimental_options: {
    return_figure_images: true,
    return_table_images: true,
    rotate_images: true,
  },
};

export function Content({ block }: { block: any }) {
  return match(block.type)
    .with("Title", () => (
      <h1 className="mb-4 mt-4 scroll-m-20 border-b-2 pb-2 text-3xl font-semibold tracking-tight first:mt-0">
        {"# " + block.content}
      </h1>
    ))
    .with("Section Header", () => (
      <h2 className="mt-2 scroll-m-20 text-2xl font-semibold tracking-tight">
        {"## " + block.content}
      </h2>
    ))
    .with("List Item", () => <li className="list-none">{block.content}</li>)
    .with("Table", () => (
      <div
        className="h-fit w-full overflow-auto whitespace-pre-line"
        dangerouslySetInnerHTML={{
          __html: block.content,
        }}
      ></div>
    ))
    .with("Figure", () => {
      if (
        block.content.startsWith("This image shows") &&
        block.content.replace("AI summary of figure: ", "").trim().length > 0
      ) {
        return (
          <>
            {/* @ts-ignore */}
            {block.image_url &&
            block.bbox?.width > 0.1 &&
            block.bbox?.height > 0.1 ? (
              <img
                // @ts-ignore
                src={block.image_url}
                alt="Figure"
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  maxHeight: "300px",
                  objectFit: "contain",
                }}
              />
            ) : null}

            <div className="border border-black p-2">
              <div className="flex flex-row items-center space-x-2">
                <BotIcon /> <b>AI Figure Summary</b>
              </div>
              {block.content.replace("AI summary of figure: ", "")}
            </div>
          </>
        );
      } else if (block.content.startsWith("AI Extracted Chart Data:")) {
        const data = block.content
          .replace("AI Extracted Chart Data:", "")
          .replaceAll('"', "")
          .trim();
        const lines = data
          .split("\\n")
          .map((line) => line.trim())
          .filter((line) => line !== "");
        const tableData = lines.map((line) =>
          line.split("|").map((cell) => cell.trim())
        );

        return (
          <table>
            {tableData.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) =>
                  // Render header cells for the first row, otherwise render standard cells
                  index === 0 || index === 1 ? (
                    cell.trim().length > 0 && cell.trim() !== "TITLE" ? (
                      <th key={cellIndex} className="text-left">
                        {cell}
                      </th>
                    ) : null
                  ) : (
                    <td key={cellIndex} className="text-left">
                      {cell}
                    </td>
                  )
                )}
              </tr>
            ))}
          </table>
        );
      } else if (block.content.trim().length > 0) {
        return (
          <div className="flex flex-col items-start space-y-2">
            {/* @ts-ignore */}
            {block.image_url ? (
              <img
                // @ts-ignore
                src={block.image_url}
                alt="Figure"
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  maxHeight: "300px",
                  objectFit: "contain",
                }}
              />
            ) : null}
            <div className="rounded-lg border p-2">
              <b>Figure Text:</b> <br />
              {block.content}
            </div>
          </div>
        );
      }
      return null;
    })
    .with("Page Number", () => (
      <p className="mb-2 whitespace-pre-wrap">{block.content}</p>
    ))
    .with("Footer", () => (
      <p className="mb-2 whitespace-pre-wrap">{block.content}</p>
    ))
    .otherwise(() => (
      <p className="mb-2 whitespace-pre-wrap">{block.content}</p>
    ));
}

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | undefined>(undefined);
  const [numPages, setNumPages] = useState<number>(0);
  const [apiUrl, setApiUrl] = useState<string>(
    import.meta.env.VITE_API_URL ?? "https://platform.reducto.ai"
  );
  const [apiToken, setApiToken] = useState<string>(
    import.meta.env.VITE_API_TOKEN ?? ""
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [output, setOutput] = useState<string>("");
  const [pagination, setPagination] = useState<number>(0);
  const [showBlocks, setShowBlocks] = useState<boolean>(false);
  const [jsonOutput, setJsonOutput] = useState<
    components["schemas"]["ParseResponse"] | null
  >(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<ParseConfig>(defaultParseConfig);
  const [activeTab, setActiveTab] = useState<"config" | "result">("config");
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

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

  const { data: jobData } = useQuery({
    queryKey: ["jobStatus", jobId],
    queryFn: () => fetchJobStatus(apiUrl, jobId!, apiToken),
    enabled: !!jobId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    retry: 15 * 60, // Timeout after 15 minutes
    retryDelay: 1000,
  });

  useEffect(() => {
    const parseOutput = async () => {
      try {
        if (output) {
          let parsed = JSON.parse(output);

          if (parsed.result.type === "url") {
            const response = await fetch(parsed.result.url);
            const json = await response.json();
            parsed.result = json;
            setJsonOutput(parsed);
          } else if (parsed.result.type === "full") {
            setJsonOutput(parsed);
          }
        }
      } catch (error) {
        console.error("Failed to parse output:", error);
        setJsonOutput(null);
      }
    };

    parseOutput();
  }, [output]);

  useEffect(() => {
    if (jobData) {
      if (jobData.status === "Failed") {
        console.error(`Job ${jobId} failed:`, jobData.reason);
      }
      setOutput(JSON.stringify(jobData.result));
      setLoading(false);
      setJobId(null);
      setActiveTab("result"); // Switch to result tab when done
    }
  }, [jobData]);

  const onProcessDocument = useCallback(async () => {
    if (pdfFile) {
      setLoading(true);
      try {
        const fileId = await uploadFile(apiUrl, pdfFile, apiToken);
        const jobId = await getJobId(apiUrl, fileId, apiToken, apiConfig);
        setJobId(jobId);
      } catch (err) {
        setLoading(false);
        alert(err);
      }
    }
  }, [pdfFile, apiUrl, apiToken, apiConfig]);

  const scrollToBboxOrBlock = useCallback(
    (
      chunkIndex: number,
      blockIndex: number,
      isBbox: boolean = true,
      color: string = "gray"
    ) => {
      // Switch to result tab when bounding box is clicked
      setActiveTab("result");

      // Add a small delay to allow the tab content to render
      setTimeout(() => {
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
      }, 100); // 100ms delay to allow tab content to render
    },
    []
  );

  const tableSummaries = useMemo(() => {
    if (jsonOutput?.result?.type !== "full") return [];
    const tables = jsonOutput.result.chunks.map((chunk) =>
      chunk.embed
        .split("\n\n")
        .map((text) => text.trim())
        .filter((text) => text.toLowerCase().startsWith("this table"))
    );

    return jsonOutput.result.chunks.map((chunk, chunkIndex) => {
      let i = 0;
      let tableSummaries: { [key: number]: string } = {};
      chunk.blocks.forEach((block, blockIndex) => {
        if (block.type === "Table") {
          tableSummaries[blockIndex] = tables[chunkIndex]![i]!;
          i++;
        }
      });
      return tableSummaries;
    });
  }, [jsonOutput]);

  const blocksByPage = useMemo(() => {
    if (jsonOutput?.result?.type !== "full" || !jsonOutput?.result?.chunks)
      return {};

    return jsonOutput.result.chunks.reduce<{
      [key: number]: {
        block: components["schemas"]["ParseBlock"];
        chunkIndex: number;
        blockIndex: number;
      }[];
    }>(
      (
        acc: {
          [key: number]: {
            block: components["schemas"]["ParseBlock"];
            chunkIndex: number;
            blockIndex: number;
          }[];
        },
        chunk,
        chunkIndex
      ) => {
        chunk.blocks.forEach((block, blockIndex) => {
          const page = block.bbox?.page || 0;
          if (!acc[page]) acc[page] = [];
          acc[page].push({ block, chunkIndex, blockIndex });
        });
        return acc;
      },
      {}
    );
  }, [jsonOutput]);

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
            value={output}
            onChange={(e) => setOutput(e.target.value)}
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
                  <Label htmlFor="api-config" className="text-lg font-semibold">
                    API Config
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        JSON.stringify(apiConfig, null, 2)
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  id="api-config"
                  className="w-full font-mono min-h-[400px] text-sm"
                  value={JSON.stringify(apiConfig, null, 2)}
                  onChange={(e) => {
                    try {
                      setApiConfig(JSON.parse(e.target.value));
                    } catch {
                      // Invalid JSON, don't update
                    }
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === "result" && (
            <div>
              {jsonOutput ? (
                <div className="space-y-8">
                  {Object.entries(blocksByPage).map(([page, blocks]) => (
                    <div key={page} className="rounded-lg border bg-card p-4">
                      <div className="space-y-2">
                        {blocks.map(
                          ({ block, chunkIndex, blockIndex }, index) => {
                            // Add chunk separator if next block is from a different chunk
                            const nextBlock = blocks[index + 1];
                            const isChunkBoundary =
                              nextBlock && nextBlock.chunkIndex !== chunkIndex;

                            return (
                              <div
                                key={`block_wrapper_${chunkIndex}_${blockIndex}`}
                              >
                                {showBlocks ? (
                                  <Card
                                    key={`block_${chunkIndex}_${blockIndex}`}
                                    id={`block_${chunkIndex}_${blockIndex}`}
                                    className={`flex cursor-pointer flex-col space-y-2 transition-colors duration-1000 hover:bg-gray-50 [&.bg-${
                                      bboxTypeColors[block.type]
                                    }-500]:!bg-${
                                      bboxTypeColors[block.type]
                                    }-500`}
                                    onClick={() =>
                                      scrollToBboxOrBlock(
                                        chunkIndex,
                                        blockIndex,
                                        true,
                                        bboxTypeColors[block.type]
                                      )
                                    }
                                  >
                                    <CardHeader className="-mb-6">
                                      <Badge
                                        className={`w-fit bg-${
                                          bboxTypeColors[block.type] || "gray"
                                        }-500 hover:bg-${
                                          bboxTypeColors[block.type] || "gray"
                                        }-500`}
                                      >
                                        {block.type}
                                      </Badge>
                                    </CardHeader>
                                    <CardContent className="whitespace-pre-line text-wrap">
                                      {block.content}
                                    </CardContent>
                                  </Card>
                                ) : (
                                  <div
                                    key={`text_block_${chunkIndex}_${blockIndex}`}
                                    id={`text_block_${chunkIndex}_${blockIndex}`}
                                    className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-gray-50"
                                    onClick={() =>
                                      scrollToBboxOrBlock(
                                        chunkIndex,
                                        blockIndex,
                                        true,
                                        bboxTypeColors[block.type]
                                      )
                                    }
                                  >
                                    <div
                                      className={`relative ${
                                        block.type === "Table"
                                          ? "pl-6 pt-6"
                                          : ""
                                      }`}
                                    >
                                      {tableSummaries[chunkIndex]?.[
                                        blockIndex
                                      ] && (
                                        <div className="absolute left-0 top-0 z-50">
                                          <TooltipProvider>
                                            <Tooltip
                                              open={
                                                activeTooltip ===
                                                `${chunkIndex}_${blockIndex}`
                                              }
                                            >
                                              <TooltipTrigger
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (
                                                    activeTooltip ===
                                                    `${chunkIndex}_${blockIndex}`
                                                  ) {
                                                    setActiveTooltip(null);
                                                  } else {
                                                    setActiveTooltip(
                                                      `${chunkIndex}_${blockIndex}`
                                                    );
                                                  }
                                                }}
                                              >
                                                <div
                                                  className="animate-glow group relative h-6 w-6"
                                                  style={{
                                                    animation:
                                                      "glow 2s ease-in-out infinite alternate",
                                                    filter:
                                                      "drop-shadow(0 0 5px var(--reducto-light-purple)) drop-shadow(0 0 8px var(--reducto-light-purple))",
                                                  }}
                                                >
                                                  <Sparkles
                                                    className="animate-glow absolute h-6 w-6"
                                                    style={{
                                                      color:
                                                        "var(--reducto-mid-purple)",
                                                    }}
                                                  />
                                                </div>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                onPointerDownOutside={() =>
                                                  setActiveTooltip(null)
                                                }
                                                className="max-w-[400px] z-50"
                                              >
                                                <div className="flex flex-col space-y-1">
                                                  <div className="flex items-center space-x-2">
                                                    <Sparkles className="h-4 w-4" />
                                                    <span className="font-bold">
                                                      Reducto AI Table Summary
                                                    </span>
                                                  </div>
                                                  <p>
                                                    {
                                                      tableSummaries[
                                                        chunkIndex
                                                      ][blockIndex]
                                                    }
                                                  </p>
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        </div>
                                      )}
                                      <Content block={block} />
                                    </div>
                                  </div>
                                )}
                                {isChunkBoundary && (
                                  <div className="my-4 border-t border-dashed border-gray-200" />
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  {loading
                    ? "Processing document..."
                    : "No results yet. Configure parsing options and process a document."}
                </div>
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
      jsonOutput={jsonOutput}
      setJsonOutput={setJsonOutput}
      loading={loading}
      showBlocks={showBlocks}
      setShowBlocks={setShowBlocks}
      onProcessDocument={onProcessDocument}
      onScrollToBlock={scrollToBboxOrBlock}
      rightPanelContent={rightPanelContent}
      accordionContent={accordionContent}
      citations={undefined}
    />
  );
}
