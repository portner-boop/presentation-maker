/**
 * Человеческие названия полей макета. Ключи вида title, left_title, item3 понятны LLM,
 * но в интерфейсе и предупреждениях нужны «Заголовок карточки 3» и «Левая колонка».
 */

/** Ключ группы: item3_title и item3 относятся к одной карточке item3. */
export function slotGroup(key: string): string {
  return key.replace(/_title$/, '');
}

export function slotGroupLabel(group: string): string {
  if (group === 'title') return 'Заголовок слайда';
  if (group === 'subtitle') return 'Подзаголовок';
  if (group === 'body') return 'Текст';
  if (group === 'left') return 'Левая колонка';
  if (group === 'right') return 'Правая колонка';
  const item = group.match(/^item(\d+)$/);
  return item ? `Карточка ${item[1]}` : group;
}

export function slotLabel(key: string): string {
  const group = slotGroup(key);
  if (key === group) return slotGroupLabel(group);
  if (group === 'body') return 'Заголовок текста';
  if (group === 'left') return 'Заголовок левой колонки';
  if (group === 'right') return 'Заголовок правой колонки';
  const item = group.match(/^item(\d+)$/);
  return item ? `Заголовок карточки ${item[1]}` : key;
}
