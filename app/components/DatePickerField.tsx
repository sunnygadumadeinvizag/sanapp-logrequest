"use client";

import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(value: string | null | undefined): Date | undefined {
  if (!value || !YMD_RE.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * shadcn calendar picker that stays form-friendly: renders a hidden input
 * carrying the chosen YYYY-MM-DD value under the given field name, so plain
 * server-rendered <form> submissions keep working unchanged.
 */
export function DatePickerField({
  name,
  id,
  defaultValue = "",
  placeholder = "Pick a date",
  clearable = true,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const selected = parseYmd(value);
  return (
    <div className="flex items-center gap-1">
      <input id={id} type="hidden" name={name} value={value} />
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-8 justify-start px-2.5 text-xs font-normal">
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
            {selected ? (
              format(selected, "EEE, dd MMM yyyy")
            ) : (
              <span className="opacity-60">{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return;
              const y = d.getFullYear();
              const mo = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              setValue(`${y}-${mo}-${day}`);
            }}
            initialFocus
          />
          {clearable && value ? (
            <div className="border-t p-1">
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setValue("")}>
                <X className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
