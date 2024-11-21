import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pdfjs } from "react-pdf";
import { Document, Page } from "react-pdf";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { match } from "ts-pattern";
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
import { Loader2Icon } from "lucide-react";

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
    },
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

async function getJobId(apiUrl: string, fileId: string, token: string) {
  console.log("document_url:", fileId);
  try {
    const async_response = await fetch(`${apiUrl}/parse`, {
      method: "POST",
      body: JSON.stringify({
        document_url: fileId,
        async: {
          enabled: true,
        },
        config: {
          pdf_ocr: "hybrid",
          ocr_system: "tesseract",
        },
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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

  const minPage = Math.max(0, pagination * MAX_PAGINATION);
  const maxPage = Math.min((pagination + 1) * MAX_PAGINATION, numPages);
  const pageRefs = useRef<HTMLCanvasElement[]>([]);

  const [jsonOutput, setJsonOutput] = useState<any>(null);
  const [jobId, setJobId] = useState<string | null>(null);

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

  return (
    <>
      {numPages > MAX_PAGINATION && (
        <div className="sticky top-0 bg-white z-50 w-full p-4">
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
            {Array.from({ length: maxPage - minPage }, (_, i) => (
              <Button
                key={i + minPage}
                variant={"ghost"}
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
      <div className="h-full w-full p-4 flex flex-col space-y-2">
        <h1 className="text-2xl font-semibold">
          Reducto Local Document Playground
        </h1>
        <div className="flex flex-row space-x-2 items-center">
          <Label htmlFor="pdf-file" className="w-fit whitespace-nowrap">
            PDF File:
          </Label>
          <Input
            id="pdf-file"
            type="file"
            onChange={(e) => {
              setJsonOutput(null);
              setPdfFile(e.target.files?.[0]);
            }}
          />
        </div>
        <Tabs defaultValue="json" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger className="w-full" value="json">
              Manual JSON
            </TabsTrigger>
            <TabsTrigger className="w-full" value="api">
              Run API
            </TabsTrigger>
          </TabsList>
          <TabsContent value="json">
            <Input
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              className="w-full"
              placeholder="Paste your JSON here"
            />
          </TabsContent>
          <TabsContent value="api" className="flex flex-col space-y-2">
            <div className="flex flex-row space-x-2 items-center">
              <Label htmlFor="api-url" className="w-fit whitespace-nowrap">
                API URL:
              </Label>
              <Input
                id="api-url"
                type="text"
                placeholder="https://v1.api.reducto.ai"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-row space-x-2 items-center">
              <Label htmlFor="api-token" className="w-fit whitespace-nowrap">
                Token:
              </Label>
              <Input
                type="password"
                id="api-token"
                className="w-full"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (pdfFile) {
                  setLoading(true);
                  uploadFile(apiUrl, pdfFile, apiToken)
                    .then((out) => {
                      console.log("file_id:", out);
                      return getJobId(apiUrl, out, apiToken);
                    })
                    .then((jobId) => {
                      setJobId(jobId);
                    })
                    .catch((err) => {
                      setLoading(false);
                      alert(err);
                    });
                }
              }}
              disabled={loading}
            >
              {loading ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                "Run Document"
              )}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="flex flex-row">
          <div className="w-1/2">
            <Document
              file={pdfFile}
              onLoadSuccess={(e) => {
                setPagination(0);
                setNumPages(e.numPages);
              }}
            >
              {Array.from({ length: numPages }, (_, i) =>
                i >= minPage && i < maxPage ? (
                  <Page
                    canvasRef={(el) => (pageRefs[i] = el)}
                    key={`page_${i}`}
                    pageNumber={i + 1}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  >
                    <div className="absolute left-0 top-0 z-20 h-full w-full">
                      {bboxes
                        ?.filter((bbox) => bbox.page === i + 1)
                        .map((bbox, i) => {
                          return (
                            <HoverCard key={i}>
                              <HoverCardTrigger asChild>
                                <div
                                  id={`bbox_${i}`}
                                  key={`bbox_${i}`}
                                  className="group absolute -z-30 outline outline-2 outline-blue-500"
                                  style={{
                                    top: bbox.top * 100 + "%",
                                    left: bbox.left * 100 + "%",
                                    width: bbox.width * 100 + "%",
                                    height: bbox.height * 100 + "%",
                                  }}
                                >
                                  <div className="relative -left-[2px] -top-6 hidden w-fit whitespace-nowrap rounded-t-md bg-blue-500 px-2 py-1  text-xs text-white group-hover:block">
                                    {bbox.type}
                                  </div>
                                </div>
                              </HoverCardTrigger>

                              <HoverCardContent className="z-50 mb-8 w-[50vw]">
                                {jsonOutput!.result.type === "full" ? (
                                  <Content
                                    block={
                                      jsonOutput!.result.chunks[
                                        bbox.chunkIndex
                                      ]!.blocks[bbox.blockIndex]!
                                    }
                                  />
                                ) : null}
                              </HoverCardContent>
                            </HoverCard>
                          );
                        })}
                    </div>
                  </Page>
                ) : null
              )}
            </Document>
            <div className="w-full"></div>
          </div>
          <div className="w-1/2">
            {jsonOutput ? (
              <Accordion
                type="multiple"
                defaultValue={jsonOutput!.result.chunks.map(
                  (_, idx) => `accordion_item_${idx}`
                )}
                className="w-full"
              >
                {jsonOutput!.result.chunks.map((chunk, idx) => {
                  const isPageInRange = chunk.blocks.some(
                    (block) =>
                      block.bbox.page - 1 >= minPage &&
                      block.bbox.page - 1 < maxPage
                  );
                  if (!isPageInRange) {
                    return null;
                  }
                  return (
                    <AccordionItem
                      key={`accordion_item_${idx}`}
                      value={`accordion_item_${idx}`}
                    >
                      <AccordionTrigger>Chunk {idx + 1}</AccordionTrigger>
                      <AccordionContent className="flex h-fit flex-col space-y-2">
                        <Tabs className="w-full" defaultValue="text">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="text">
                              Concatenated Text
                            </TabsTrigger>
                            <TabsTrigger value="blocks">
                              Individual Blocks
                            </TabsTrigger>
                          </TabsList>
                          <TabsContent value="blocks">
                            {chunk.blocks.map((c, i) => (
                              <Card
                                className="flex flex-col space-y-2"
                                key={`card_${idx}_${i}`}
                              >
                                <CardHeader className="-mb-6 ">
                                  <Badge className="w-fit bg-blue-500 hover:bg-blue-500">
                                    {c.type}
                                  </Badge>
                                </CardHeader>
                                <CardContent className="whitespace-pre-line text-wrap">
                                  {c.content}
                                </CardContent>
                              </Card>
                            ))}
                          </TabsContent>
                          <TabsContent value="text">
                            <Card>
                              <CardContent className="flex flex-col space-y-4 whitespace-pre-wrap pt-4">
                                {chunk.enrichment_success ? (
                                  <div className="overflow-auto whitespace-pre">
                                    {chunk.enriched}
                                  </div>
                                ) : null}
                                {chunk.blocks.map((block, i: number) =>
                                  block.bbox.page - 1 >= minPage &&
                                  block.bbox.page - 1 < maxPage ? (
                                    <Content block={block} key={i} />
                                  ) : null
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>
                        </Tabs>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : null}
          </div>
        </div>
      </div>
    </>
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
        block.content.includes("AI summary of figure: ") &&
        block.content.replace("AI summary of figure: ", "").trim().length > 0
      ) {
        return (
          <div className="border border-black p-2">
            <div className="flex flex-row items-center space-x-2">
              <b>AI Figure Summary</b>
            </div>
            {block.content.replace("AI summary of figure: ", "")}
          </div>
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
      }
      return null;
    })
    .with("Page Number", () => null)
    .with("Footer", () => null)
    .otherwise(() => (
      <p className="mb-2 whitespace-pre-wrap">{block.content}</p>
    ));
}
