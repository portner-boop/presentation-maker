import { AppShell, Box, Burger, Button, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { LayoutTemplate, Plus, Presentation } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useHealth } from '../../api/queries';
import { BrandMark } from './BrandMark';
import classes from './AppLayout.module.css';

const NAV = [
  { to: '/', label: 'Презентации', icon: Presentation, end: true },
  { to: '/templates', label: 'Шаблоны', icon: LayoutTemplate, end: false },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isPresentationRoute = pathname === '/' || pathname.startsWith('/presentations');

  const go = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <AppShell
      navbar={{ width: 248, breakpoint: 'md', collapsed: { mobile: !opened } }}
      header={{ height: { base: 56, md: 0 } }}
      withBorder={false}
      classNames={{ header: classes.header, navbar: classes.navbar, main: classes.main }}
    >
      <AppShell.Header hiddenFrom="md">
        <div className={classes.headerRow}>
          <Burger
            opened={opened}
            onClick={toggle}
            color="white"
            size="sm"
            aria-label={opened ? 'Закрыть меню' : 'Открыть меню'}
          />
          <BrandMark />
          <Button
            size="sm"
            leftSection={<Plus size={16} strokeWidth={2} />}
            onClick={() => go('/presentations/new')}
          >
            Создать
          </Button>
        </div>
      </AppShell.Header>

      <AppShell.Navbar>
        {/* на мобильных знак и главная кнопка уже есть в шапке */}
        <Box className={classes.brand} visibleFrom="md">
          <BrandMark />
        </Box>

        <Button
          className={classes.primary}
          visibleFrom="md"
          fullWidth
          leftSection={<Plus size={18} strokeWidth={2} />}
          onClick={() => go('/presentations/new')}
        >
          Новая презентация
        </Button>

        <nav className={classes.nav} aria-label="Разделы">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={close}
              className={({ isActive }) =>
                `${classes.link} ${isActive || (to === '/' && isPresentationRoute && pathname !== '/presentations/new') ? classes.active : ''}`
              }
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <ServiceStatus />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

function ServiceStatus() {
  const { data, isError, isPending, refetch } = useHealth();
  const ok = data?.status === 'ok';
  const label = isPending
    ? 'Проверяем сервис'
    : isError
      ? 'API недоступен'
      : ok
        ? 'Сервис работает'
        : 'Сервис частично недоступен';
  const detail = isError
    ? 'Нажмите, чтобы проверить снова'
    : data
      ? `БД ${data.db === 'up' ? 'в порядке' : 'недоступна'} · Redis ${data.redis === 'up' ? 'в порядке' : 'недоступен'}`
      : '';

  return (
    <UnstyledButton className={classes.status} onClick={() => refetch()} aria-live="polite">
      <span
        className={classes.statusDot}
        data-state={isPending ? 'pending' : ok ? 'ok' : 'error'}
        aria-hidden
      />
      <span>
        <span className={classes.statusLabel}>{label}</span>
        {detail && <span className={classes.statusDetail}>{detail}</span>}
      </span>
    </UnstyledButton>
  );
}
