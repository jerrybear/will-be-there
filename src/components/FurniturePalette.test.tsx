import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FurniturePalette } from './FurniturePalette';
import type { FurnitureTemplate } from '../types/layout';

const baseItems: FurnitureTemplate[] = [
  {
    id: 'door',
    label: '문',
    category: 'doors',
    width: 80,
    height: 24,
    color: '#cbd5e1',
    kind: 'door',
    threeModel: 'box',
    objectHeight: 210,
    elevation: 0,
    isWallAttached: true,
  },
];

describe('FurniturePalette', () => {
  it('opens the custom item form and submits a new template', async () => {
    const user = userEvent.setup();
    const onAddCustomItem = vi.fn(() => 'custom-furniture-1');

    render(
      <FurniturePalette
        items={baseItems}
        onAdd={vi.fn()}
        onAddCustomItem={onAddCustomItem}
      />,
    );

    await user.click(screen.getByRole('button', { name: '직접 추가' }));
    await user.type(screen.getByPlaceholderText('예: 협탁'), '협탁');
    await user.selectOptions(screen.getByDisplayValue('의자/소파'), 'storage');
    await user.clear(screen.getByDisplayValue('1200'));
    await user.type(screen.getByLabelText('가로 (mm)'), '48');
    await user.clear(screen.getByDisplayValue('800'));
    await user.type(screen.getByLabelText('깊이 (mm)'), '40');
    await user.clear(screen.getByDisplayValue('700'));
    await user.type(screen.getByLabelText('높이 (mm)'), '52');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(onAddCustomItem).toHaveBeenCalledWith({
      label: '협탁',
      category: 'storage',
      width: 48,
      height: 40,
      objectHeight: 52,
      color: '#94a3b8',
    });
  });
});
