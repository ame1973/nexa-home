import { AppWindow, Archive, BookOpen, Box, Calendar, Camera, Clapperboard, Cloud, Code, Container, Cpu, Database, Download, Files, Film, Folder, FolderOpen, Gamepad2, Globe, HardDrive, Heart, House, Images, LayoutGrid, Link as LinkIcon, Lock, Mail, MessageCircle, Monitor, Music, Network, NotebookPen, Radio, Router, Rss, ScanLine, Search, Server, Settings, Shield, SquareTerminal, Star, Terminal, Upload, Wifi, type LucideIcon, type LucideProps } from 'lucide-react';
import names from '../../../../api/icons.json';

export const iconNames: readonly string[] = names;
export const iconRegistry: Record<string, LucideIcon> = {
  'app-window': AppWindow, archive: Archive, 'book-open': BookOpen, box: Box, calendar: Calendar, camera: Camera, clapperboard: Clapperboard,
  cloud: Cloud, code: Code, container: Container, cpu: Cpu, database: Database, download: Download, files: Files, film: Film,
  folder: Folder, 'folder-open': FolderOpen, 'gamepad-2': Gamepad2, globe: Globe, 'hard-drive': HardDrive, heart: Heart, house: House,
  images: Images, 'layout-grid': LayoutGrid, link: LinkIcon, lock: Lock, mail: Mail, 'message-circle': MessageCircle, monitor: Monitor,
  music: Music, network: Network, 'notebook-pen': NotebookPen, radio: Radio, router: Router, rss: Rss, 'scan-line': ScanLine,
  search: Search, server: Server, settings: Settings, shield: Shield, 'square-terminal': SquareTerminal, star: Star, terminal: Terminal,
  upload: Upload, wifi: Wifi,
};
export function Icon({ name, ...props }: LucideProps & { name: string }) {
  const Component = iconRegistry[name] ?? AppWindow;
  return <Component aria-hidden="true" {...props} />;
}
