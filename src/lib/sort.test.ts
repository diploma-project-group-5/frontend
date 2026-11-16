import { compareLabels, sortByLabel } from './sort';

describe('порядок назв класів', () => {
  it('за номером, а не як рядки', () => {
    const names = ['10-А', '1-А', '11-Б', '2-А', '11-А', '5-Б', '5-А'];
    expect([...names].sort(compareLabels)).toEqual([
      '1-А',
      '2-А',
      '5-А',
      '5-Б',
      '10-А',
      '11-А',
      '11-Б',
    ]);
  });

  it('sortByLabel не змінює вхідний масив', () => {
    const items = [{ n: '10-А' }, { n: '9-А' }];
    expect(sortByLabel(items, (x) => x.n).map((x) => x.n)).toEqual(['9-А', '10-А']);
    expect(items[0]!.n).toBe('10-А');
  });
});
