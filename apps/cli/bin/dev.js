#!/usr/bin/env node

// development: oclif берёт команды из src/ и транспилирует их через tsx
import { execute } from '@oclif/core';

await execute({ development: true, dir: import.meta.url });
