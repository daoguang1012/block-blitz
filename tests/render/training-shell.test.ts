import { afterEach, describe, expect, it, vi } from 'vitest';
import blockPlaza from '../../public/maps/block-plaza.json';
import { DEFAULT_GAME_SETTINGS } from '../../src/config/ui';
import { createTrainingView } from '../../src/render/training-view';
import { UI_STRINGS } from '../../src/ui/strings';
import { createTrainShellView } from '../../src/ui/train/train-shell';

vi.mock('../../src/render/training-view', () => ({
  createTrainingView: vi.fn(),
}));

class TestElement extends EventTarget {
  readonly children: TestElement[] = [];
  readonly attrs = new Map<string, string>();
  readonly remove = vi.fn();
  textContent = '';

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
}

function startShell() {
  const doc = { createElement: () => new TestElement() };
  vi.stubGlobal('document', doc);
  const mount = { ownerDocument: doc } as unknown as HTMLElement;
  const onBackToMenu = vi.fn();
  const shell = createTrainShellView({
    sceneRoot: mount,
    controlsRoot: mount,
    settings: DEFAULT_GAME_SETTINGS,
    isTouch: false,
    isPortraitBlocked: () => false,
    isEscapeBlocked: () => false,
    onOpenSettings: vi.fn(),
    onBackToMenu,
  });
  const [, status, back] = (shell.element as unknown as TestElement).children[0]
    .children;
  return { shell, status, back, onBackToMenu };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('Training route loading', () => {
  it('keeps the latest settings during loading and tears down the view on exit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(blockPlaza)),
    );
    const mounted = { dispose: vi.fn(), setSettings: vi.fn() };
    vi.mocked(createTrainingView).mockReturnValue(mounted);
    const { shell, status, back, onBackToMenu } = startShell();
    expect(status.textContent).toBe(UI_STRINGS.train.loading);
    const low = { ...DEFAULT_GAME_SETTINGS, quality: 'low' } as const;
    shell.setSettings(low);
    await vi.waitFor(() =>
      expect(createTrainingView).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: low,
          map: expect.objectContaining({ id: 'block-plaza' }),
        }),
      ),
    );
    const next = { ...low, showFps: true };
    shell.setSettings(next);
    expect(mounted.setSettings).toHaveBeenCalledWith(next);

    shell.destroy();
    shell.destroy();
    back.dispatchEvent(new Event('click'));
    expect(mounted.dispose).toHaveBeenCalledTimes(1);
    expect(onBackToMenu).not.toHaveBeenCalled();
  });

  it('aborts a late map response and does not mount after leaving', async () => {
    let complete!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    const fetchMap = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      () => response,
    );
    vi.stubGlobal('fetch', fetchMap);
    const { shell } = startShell();
    shell.destroy();
    expect(fetchMap.mock.calls[0][1].signal?.aborted).toBe(true);
    complete(Response.json(blockPlaza));
    await vi.dynamicImportSettled();
    expect(createTrainingView).not.toHaveBeenCalled();
  });

  it('shows the load failure and keeps the back button usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { shell, status, back, onBackToMenu } = startShell();
    await vi.waitFor(() =>
      expect(status.textContent).toBe(UI_STRINGS.train.loadFailed),
    );
    back.dispatchEvent(new Event('click'));
    expect(onBackToMenu).toHaveBeenCalledOnce();
    expect(createTrainingView).not.toHaveBeenCalled();
    shell.destroy();
  });
});
