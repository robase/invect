import { DemoPage } from './demo-page';

export const metadata = {
  title: 'Live Demo — Invect',
  description:
    'Interactive demo of the full Invect workflow editor — sidebar, flow canvas, and node palette — rendered entirely in the browser with no backend.',
};

export default function Page() {
  return <DemoPage />;
}
