"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

function splitValue(value: string): { ymd: string; time: string } {
  const m = DT_RE.exec(value ?? "");
  return { ymd: m ? m[1] : "", time: m ? m[2] : "" };
}

function toLocalDate(ymd: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

/**
 * shadcn calendar + time input producing datetime-local style values
 * ("YYYY-MM-DDTHH:mm"), replacing the raw <input type="datetime-local">.
 */
export function DateTimePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { ymd, time } = splitValue(value);
  const selected = toLocalDate(ymd);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-8 flex-1 justify-start px-2.5 text-xs font-normal"
          >
            <CalendarIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            {selected ? (
              format(selected, "EEE, dd MMM yyyy")
            ) : (
              <span className="text-muted-foreground">Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (d) {
                const y = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                onChange(`${y}-${mo}-${day}T${time || "09:00"}`);
                setOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        value={time}
        disabled={disabled || !ymd}
        placeholder="09:00"
        onChange={(e) => onChange(`${ymd}T${e.target.value || "00:00"}`)}
        className="h-8 w-[104px] text-xs"
        aria-label="Time (IST)"
      />
    </div>
  );
}
