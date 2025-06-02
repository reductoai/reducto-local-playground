import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy } from "lucide-react";

interface JsonSchemaBuilderProps {
  schema: any;
  onSchemaChange: (schema: any) => void;
}

export default function JsonSchemaBuilder({
  schema,
  onSchemaChange,
}: JsonSchemaBuilderProps) {
  const [rawSchema, setRawSchema] = useState(
    JSON.stringify(schema || {}, null, 2)
  );

  const handleRawSchemaChange = (value: string) => {
    setRawSchema(value);
    try {
      const parsed = JSON.parse(value);
      onSchemaChange(parsed);
    } catch {
      // Invalid JSON, don't update
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-lg font-semibold">JSON Schema</Label>
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
        className="font-mono min-h-[400px]"
        placeholder="Enter your JSON schema here..."
      />

      <Card>
        <CardHeader>
          <CardTitle>Schema Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm bg-gray-50 p-4 rounded-md overflow-auto max-h-40">
            {rawSchema}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
