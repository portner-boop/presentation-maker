import type { CreatePresentationInput, Presentation, Template } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  health: ['health'] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  presentations: ['presentations'] as const,
  presentation: (id: string) => ['presentations', id] as const,
};

const ACTIVE_TEMPLATE = new Set<Template['status']>(['PENDING', 'PROCESSING']);
const ACTIVE_PRESENTATION = new Set<Presentation['status']>(['PENDING', 'GENERATING']);

export const isTemplateActive = (t: Template) => ACTIVE_TEMPLATE.has(t.status);
export const isPresentationActive = (p: Presentation) => ACTIVE_PRESENTATION.has(p.status);

/** Статусы обновляются опросом, пока в очереди что-то идёт; в покое запросов нет. */
export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.templates.list,
    refetchInterval: (query) => (query.state.data?.some(isTemplateActive) ? 1_500 : false),
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.template(id ?? ''),
    queryFn: () => api.templates.get(id!),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && isTemplateActive(query.state.data) ? 1_500 : false,
  });
}

export function usePresentations() {
  return useQuery({
    queryKey: queryKeys.presentations,
    queryFn: api.presentations.list,
    refetchInterval: (query) => (query.state.data?.some(isPresentationActive) ? 1_000 : false),
  });
}

export function usePresentation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.presentation(id ?? ''),
    queryFn: () => api.presentations.get(id!),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && isPresentationActive(query.state.data) ? 1_000 : false,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useUploadTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.templates.upload({ file, fileName: file.name }),
    onSuccess: (template) => {
      client.setQueryData(queryKeys.template(template.id), template);
      return client.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });
}

export function useCreatePresentation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePresentationInput) => api.presentations.create(input),
    onSuccess: (presentation) => {
      client.setQueryData(queryKeys.presentation(presentation.id), presentation);
      return client.invalidateQueries({ queryKey: queryKeys.presentations });
    },
  });
}

export function useRetryPresentation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.presentations.retry(id),
    onSuccess: (presentation) => {
      client.setQueryData(queryKeys.presentation(presentation.id), presentation);
      return client.invalidateQueries({ queryKey: queryKeys.presentations });
    },
  });
}
