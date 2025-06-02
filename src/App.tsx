import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pdfjs } from "react-pdf";
import { Document, Page } from "react-pdf";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { match } from "ts-pattern";
import { components } from "../schema";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  BotIcon,
  Download,
  LayoutPanelTop,
  Loader2Icon,
  Sparkles,
} from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { bboxTypeColors } from "./lib/colors";
import { Toggle } from "./components/ui/toggle";
import { Textarea } from "./components/ui/textarea";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const MAX_PAGINATION = 15;

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
  },
};

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

  const minPage = Math.max(0, pagination * MAX_PAGINATION);
  const maxPage = Math.min((pagination + 1) * MAX_PAGINATION, numPages);
  const pageRefs = useRef<HTMLCanvasElement[]>([]);

  const [jsonOutput, setJsonOutput] = useState<
    components["schemas"]["ParseResponse"] | null
  >(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<ParseConfig>(defaultParseConfig);

  const { data: jobData } = useQuery({
    queryKey: ["jobStatus", jobId],
    queryFn: () => fetchJobStatus(apiUrl, jobId!, apiToken),
    enabled: !!jobId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    retry: 15 * 60, // Timeout after 15 minutes
    retryDelay: 1000,
  });

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  useEffect(() => {
    const parseOutput = async () => {
      try {
        if (output) {
          let parsed = JSON.parse(
            // output.replace(
            //   /[\u0000-\u001F\u007F-\u009F]/g,
            //   (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
            // )
            output
          );

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
    }
  }, [jobData]);

  const bboxes = useMemo(
    () =>
      jsonOutput?.result.type === "full"
        ? jsonOutput?.result.chunks.flatMap((r, chunkIndex) =>
            r.blocks.flatMap((b, blockIndex) => ({
              ...b.bbox,
              type: b.type,
              chunkIndex,
              blockIndex,
            }))
          )
        : [],
    [jsonOutput]
  );

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if the active element is an input or textarea
      const activeElement = document.activeElement;
      const isInputActive =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      if (!isInputActive) {
        if (e.key === "ArrowRight" && maxPage < numPages) {
          setPagination(pagination + 1);
        } else if (e.key === "ArrowLeft" && minPage > 0) {
          setPagination(pagination - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pagination, maxPage, numPages, minPage]);

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
      let tableSummaries: { [key: number]: string } = [];
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

  const downloadJson = (e) => {
    e.stopPropagation();
    if (!jsonOutput) return;

    const element = document.createElement("a");
    element.href = URL.createObjectURL(
      new Blob([JSON.stringify(jsonOutput, null, 2)], {
        type: "application/json",
      })
    );
    element.download = `${jsonOutput.job_id}.json`;
    element.click();
  };

  return (
    <div className="flex flex-col h-screen p-4">
      <Accordion
        type="single"
        collapsible
        defaultValue="controls"
        className="flex-none"
      >
        <AccordionItem value="controls" className="border-none">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex flex-row justify-between grow items-center space-x-2 pr-6">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-semibold">
                  Reducto Local Document Playground
                </h1>
              </div>

              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" onClick={downloadJson}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download JSON Result</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <Toggle
                        pressed={showBlocks}
                        onPressedChange={setShowBlocks}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2"
                      >
                        <LayoutPanelTop className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle Block View</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="pdf-file"
                  type="file"
                  onChange={(e) => {
                    setJsonOutput(null);
                    setPdfFile(e.target.files?.[0]);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-80"
                />
                <Button
                  onClick={(e) => {
                    if (pdfFile) {
                      setLoading(true);
                      uploadFile(apiUrl, pdfFile, apiToken)
                        .then((out) =>
                          getJobId(apiUrl, out, apiToken, apiConfig)
                        )
                        .then((jobId) => setJobId(jobId))
                        .catch((err) => {
                          setLoading(false);
                          alert(err);
                        });
                    }
                    e.stopPropagation();
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2Icon className="animate-spin mr-2 h-4 w-4" />
                  ) : null}
                  Process Document
                </Button>
              </div>
            </div>
          </AccordionTrigger>

          <AccordionContent>
            <div className="controls-section space-y-4 px-1">
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
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="api-url">API URL</Label>
                      <Input
                        id="api-url"
                        type="text"
                        placeholder="https://v1.api.reducto.ai"
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api-token">API Token</Label>
                      <Input
                        type="password"
                        id="api-token"
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api-token">API Config</Label>
                      <Textarea
                        id="api-config"
                        className="w-full font-mono min-h-[40px] h-[40px]"
                        value={JSON.stringify(apiConfig, null, 2)}
                        onChange={(e) =>
                          setApiConfig(
                            JSON.parse(
                              e.target.value
                            ) as components["schemas"]["AsyncParseConfigNew"]
                          )
                        }
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
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {numPages > MAX_PAGINATION && (
        <div className="sticky top-0 bg-white py-2 px-4 z-50">
          <div className="flex flex-row items-center w-full justify-between">
            <Button
              disabled={minPage === 0}
              onMouseDown={() => {
                if (minPage > 0) {
                  setPagination(pagination - 1);
                }
              }}
            >
              Previous
            </Button>
            <div className="flex space-x-1">
              {Array.from({ length: maxPage - minPage }, (_, i) => (
                <Button
                  key={i + minPage}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    pageRefs[i + minPage]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                      inline: "center",
                    });
                  }}
                >
                  {i + minPage + 1}
                </Button>
              ))}
            </div>
            <Button
              disabled={maxPage >= numPages}
              onMouseDown={() => {
                if (maxPage < numPages) {
                  setPagination(pagination + 1);
                }
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 overflow-hidden border rounded-lg shadow-sm"
      >
        <ResizablePanel defaultSize={30} minSize={30}>
          <div className="h-full overflow-auto p-4">
            <Document
              file={pdfFile}
              onLoadSuccess={(e) => {
                setPagination(0);
                setNumPages(e.numPages);
              }}
              className="space-y-4"
            >
              {Array.from({ length: numPages }, (_, i) =>
                i >= minPage && i < maxPage ? (
                  <Page
                    canvasRef={(el) => (pageRefs[i] = el)}
                    key={`page_${i}`}
                    pageNumber={i + 1}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="border rounded-lg overflow-hidden shadow-sm"
                    scale={4}
                    renderMode="canvas"
                  >
                    <div className="absolute left-0 top-0 z-20 h-full w-full">
                      {bboxes
                        ?.filter((bbox) => bbox.page === i + 1)
                        .map((bbox, i) => {
                          return (
                            <HoverCard key={i}>
                              <HoverCardTrigger asChild>
                                <div
                                  id={`bbox_${bbox.chunkIndex}_${bbox.blockIndex}`}
                                  key={`bbox_${bbox.chunkIndex}_${bbox.blockIndex}`}
                                  className={`group absolute -z-30 cursor-pointer outline outline-2 outline-${
                                    bboxTypeColors[bbox.type] || "gray"
                                  }-500 transition-colors bg-${
                                    bboxTypeColors[bbox.type] || "gray"
                                  }-500 bg-opacity-20 hover:bg-opacity-0`}
                                  style={{
                                    top: bbox.top * 100 + "%",
                                    left: bbox.left * 100 + "%",
                                    width: bbox.width * 100 + "%",
                                    height: bbox.height * 100 + "%",
                                  }}
                                  onClick={() =>
                                    scrollToBboxOrBlock(
                                      bbox.chunkIndex,
                                      bbox.blockIndex,
                                      false,
                                      bboxTypeColors[bbox.type]
                                    )
                                  }
                                >
                                  <div
                                    className={`relative -left-[2px] -top-6 hidden w-fit whitespace-nowrap rounded-t-md bg-${
                                      bboxTypeColors[bbox.type] || "gray"
                                    }-500 px-2 py-1 text-xs text-white group-hover:block`}
                                  >
                                    {bbox.type}
                                  </div>
                                </div>
                              </HoverCardTrigger>

                              {/* <HoverCardContent className="z-50 mb-8 w-[50vw]">
                                {jsonOutput!.result.type === "full" ? (
                                  <Content
                                    block={
                                      jsonOutput!.result.chunks[
                                        bbox.chunkIndex
                                      ]!.blocks[bbox.blockIndex]!
                                    }
                                  />
                                ) : null}
                              </HoverCardContent> */}
                            </HoverCard>
                          );
                        })}
                    </div>
                  </Page>
                ) : null
              )}
            </Document>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={70} minSize={30}>
          <div className="h-full overflow-auto px-4 py-4">
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
                                  }-500]:!bg-${bboxTypeColors[block.type]}-500`}
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
                                      block.type === "Table" ? "pl-6 pt-6" : ""
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
                                                    tableSummaries[chunkIndex][
                                                      blockIndex
                                                    ]
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
            ) : null}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

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
