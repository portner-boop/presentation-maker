/** Все параллельные генерации (сейчас 3) должны уложиться в этот бюджет. */
export const GENERATION_TIME_BUDGET_MS = 5 * 60 * 1000;

export const TEMPLATE_FILE_EXTENSIONS = ['.pptx', '.potx'] as const;

export const MAX_TEMPLATE_SIZE_BYTES = 50 * 1024 * 1024;

/** Потолок на материалы к задаче. В LLM всё равно уходит выжимка, это защита api. */
export const MAX_SOURCES_CHARS = 3_000_000;
