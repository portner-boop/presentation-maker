import { Button } from '@mantine/core';
import { useHead } from '@unhead/react';
import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Page } from '../components/Page';

export function NotFoundPage() {
  useHead({ title: 'Страница не найдена' });
  return (
    <Page>
      <EmptyState
        icon={Compass}
        title="Такой страницы нет"
        action={
          <Button component={Link} to="/">
            К презентациям
          </Button>
        }
      >
        Возможно, ссылка устарела или презентацию удалили.
      </EmptyState>
    </Page>
  );
}
