import { useId, useState, type CSSProperties } from 'react';
import { ExternalLink, Star } from 'lucide-react';
import { useI18n } from '@/app/preferences';
import type { HealthStatus, ServiceInput } from '@/lib/api/client';
import { isColor, validURL } from '@/lib/forms';
import { Icon } from '@/lib/icons';
import { highlightParts } from '@/lib/search';
import { Card } from './ui/card';

export function ServiceIcon({ service }: { service: Pick<ServiceInput, 'iconKind' | 'iconValue' | 'iconAssetId' | 'color'> }) {
  const [failed, setFailed] = useState<string | null>(null);
  const color = isColor(service.color) ? service.color : '#405B82';
  const style = { '--service-color': color, '--service-foreground': window.NexaTheme.foreground(color) } as CSSProperties;
  const asset = service.iconKind !== 'lucide' && service.iconAssetId;
  return <span className="service-icon" style={style}>{asset && failed !== asset ? <img src={`/assets/${asset}`} alt="" loading="lazy" onError={() => setFailed(asset)} /> : <Icon name={service.iconKind === 'lucide' ? service.iconValue : 'app-window'} size={24} />}</span>;
}
function Highlight({ value, query }: { value: string; query: string }) {
  return <>{highlightParts(value, query).map((part, index) => part.match ? <mark key={index}>{part.value}</mark> : part.value)}</>;
}
export function ServiceTile({ service, query = '', preview = false, health }: { service: ServiceInput; query?: string; preview?: boolean; health?: HealthStatus }) {
  const { t, locale } = useI18n(); const described = useId();
  const primary = service.links.find((link) => link.label === 'primary')?.url ?? '';
  const checked = health?.checkedAt ? t('healthLastChecked', { time: new Date(health.checkedAt).toLocaleString(locale) }) : undefined;
  const content = <Card className="service-tile">
    <div className="tile-top">
      <ServiceIcon service={service} />
      <span className="tile-markers flex items-center gap-2 text-muted-foreground">
        {service.isFavorite && <><Star size={16} aria-hidden="true" /><span className="sr-only">{t('favorite')}</span></>}
        {service.openMode === 'new_tab' && <ExternalLink size={15} aria-hidden="true" />}
      </span>
    </div>
    <div className="tile-copy min-w-0">
      <h3 dir="auto" title={service.name}><Highlight value={service.name || t('previewName')} query={query} /></h3>
      <p dir="auto" className="mt-1.5" id={described}><Highlight value={service.description || (preview ? t('previewDescription') : '')} query={query} /></p>
    </div>
    {health && <span className="health-status" data-status={health.status} title={checked}>
      <span className="health-dot" aria-hidden="true" />
      {t(health.status === 'up' ? 'healthUp' : health.status === 'down' ? 'healthDown' : 'healthUnknown')}
      {checked && <span className="sr-only"> {checked}</span>}
    </span>}
    <span className="sr-only">{service.openMode === 'new_tab' ? t('newTab') : t('sameTab')}</span>
  </Card>;
  if (preview) return <div className="service-link">{content}</div>;
  return <a className="service-link" href={validURL(primary) ? primary : undefined} target={service.openMode === 'new_tab' ? '_blank' : undefined} rel={service.openMode === 'new_tab' ? 'noopener noreferrer' : undefined} aria-describedby={service.description ? described : undefined}>{content}</a>;
}
