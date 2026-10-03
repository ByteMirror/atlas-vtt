import { describe, expect, it } from 'vitest';
import { GENERIC_SENSES, NORMAL_SIGHT } from '../../gameSystems/senses';
import type { SenseDefinition } from '../../types/senseTypes';
import { exploredShapes } from '../exploredShapes';
import type { LightReach, Sight, SightRegion } from '../sight';

const square = (x: number): { x: number; y: number }[] => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }];
const generic = (id: string): SenseDefinition => GENERIC_SENSES.find((sense) => sense.id === id)!;

function region(sense: SenseDefinition, polygon: SightRegion['polygon']): SightRegion {
  return { tokenId: 't', sense, origin: { x: 0, y: 0 }, radius: 10, polygon, apex: 0, seesInvisible: sense.seesInvisible };
}

const seen = region(NORMAL_SIGHT, square(0));
const dark = region(generic('darkvision'), square(1));
const sight: Sight = { all: false, regions: [seen, dark] };
const torch: LightReach = { origin: { x: 5, y: 5 }, bright: 5, dim: 10, polygon: square(2) };

describe('exploredShapes', () => {
  it('records nothing while no token has vision', () => {
    expect(exploredShapes({ all: true, regions: [] }, { ambient: 0 }, [torch])).toBeNull();
  });

  it('records the whole line of sight when the scene is lit, brightly or dimly', () => {
    expect(exploredShapes(sight, { ambient: 1 }, [torch])).toEqual({ polygons: [seen.polygon, dark.polygon], clip: null });
    expect(exploredShapes(sight, { ambient: 0.5 }, [torch])).toEqual({ polygons: [seen.polygon, dark.polygon], clip: null });
  });

  it('records only lit and darkvision areas in the dark: the light inside sight, darkvision whole', () => {
    expect(exploredShapes(sight, { ambient: 0 }, [torch])).toEqual({ polygons: [torch.polygon, dark.polygon], clip: [seen.polygon, dark.polygon] });
  });

  it('records nothing in the dark without light or darkvision', () => {
    expect(exploredShapes({ all: false, regions: [seen] }, { ambient: 0 }, [])).toBeNull();
    expect(exploredShapes({ all: false, regions: [] }, { ambient: 1 }, [torch])).toBeNull();
  });

  it('counts the scene as lit from its own threshold', () => {
    expect(exploredShapes(sight, { ambient: 0.3, litThreshold: 0.5 }, [torch])).toEqual({ polygons: [torch.polygon, dark.polygon], clip: [seen.polygon, dark.polygon] });
    expect(exploredShapes(sight, { ambient: 0.5, litThreshold: 0.5 }, [torch])).toEqual({ polygons: [seen.polygon, dark.polygon], clip: null });
    expect(exploredShapes(sight, { ambient: 0, litThreshold: 0 }, [])).toEqual({ polygons: [seen.polygon, dark.polygon], clip: null });
  });

  it('records nothing while the scene remembers no explored areas', () => {
    expect(exploredShapes(sight, { ambient: 1, exploredMemory: false }, [torch])).toBeNull();
    expect(exploredShapes(sight, { ambient: 0, exploredMemory: false }, [torch])).toBeNull();
    expect(exploredShapes(sight, { ambient: 1, exploredMemory: true }, [torch])).toEqual({ polygons: [seen.polygon, dark.polygon], clip: null });
  });

  it('never records what a sense that only senses creatures reaches', () => {
    const felt = region(generic('tremorsense'), null);
    const scent: SenseDefinition = { ...generic('tremorsense'), id: 'scent', lineOfSight: true };
    const smelled = region(scent, square(3));
    expect(exploredShapes({ all: false, regions: [felt, smelled] }, { ambient: 1 }, [torch])).toBeNull();
    expect(exploredShapes({ all: false, regions: [seen, felt, smelled] }, { ambient: 0 }, [torch])).toEqual({ polygons: [torch.polygon], clip: [seen.polygon] });
  });

  it('records what blindsight and truesight perceive, in light and in darkness', () => {
    const blind = region(generic('blindsight'), square(4));
    expect(exploredShapes({ all: false, regions: [blind] }, { ambient: 0 }, [])).toEqual({ polygons: [blind.polygon], clip: [blind.polygon] });
    expect(exploredShapes({ all: false, regions: [blind] }, { ambient: 1 }, [])).toEqual({ polygons: [blind.polygon], clip: null });
  });

  it('records the light a low-light sense sees, and nothing of the dark', () => {
    const lowLight = region(generic('low-light-vision'), square(0));
    expect(exploredShapes({ all: false, regions: [seen, lowLight] }, { ambient: 0 }, [torch])).toEqual({ polygons: [torch.polygon], clip: [seen.polygon, lowLight.polygon] });
    expect(exploredShapes({ all: false, regions: [seen, lowLight] }, { ambient: 0 }, [])).toBeNull();
  });

  it('records a sense that sees only in darkness in a dark scene: for the eyes whole, since sight sees what is lit there', () => {
    const infravision: SenseDefinition = { ...generic('darkvision'), id: 'infravision', sees: { bright: 'none', dim: 'none', dark: 'as-dim', magicalDark: 'none' } };
    const heat = region(infravision, square(1));
    expect(exploredShapes({ all: false, regions: [seen, heat] }, { ambient: 0 }, [])).toEqual({ polygons: [heat.polygon], clip: [seen.polygon, heat.polygon] });
    expect(exploredShapes({ all: false, regions: [seen, heat] }, { ambient: 1 }, [])).toEqual({ polygons: [seen.polygon], clip: null });
    const eyeless = region({ ...infravision, worksWhileBlinded: true }, square(1));
    expect(exploredShapes({ all: false, regions: [eyeless] }, { ambient: 0 }, [torch])).toBeNull();
  });

  describe('with magical darkness', () => {
    const darkness: LightReach = { origin: { x: 5, y: 5 }, bright: 0, dim: 10, polygon: square(6), darkness: true };
    const truesight = region(generic('truesight'), square(7));

    it('records nothing inside a darkness source: its area is taken out of what the light and darkvision show', () => {
      expect(exploredShapes(sight, { ambient: 1 }, [torch, darkness])).toEqual({ polygons: [seen.polygon, dark.polygon], clip: null, except: { areas: [darkness.polygon], unless: [] } });
      expect(exploredShapes(sight, { ambient: 0 }, [torch, darkness])).toEqual({
        polygons: [torch.polygon, dark.polygon], clip: [seen.polygon, dark.polygon], except: { areas: [darkness.polygon], unless: [] },
      });
    });

    it('never records a darkness source as light', () => {
      expect(exploredShapes({ all: false, regions: [seen] }, { ambient: 0 }, [darkness])).toBeNull();
    });

    it('records the darkness where a sense that sees in magical darkness perceives it', () => {
      const piercing: Sight = { all: false, regions: [seen, dark, truesight] };
      expect(exploredShapes(piercing, { ambient: 0 }, [darkness])?.except).toEqual({ areas: [darkness.polygon], unless: [truesight.polygon] });
      // A sense that shows no map pierces nothing for the memory.
      const felt = region({ ...generic('tremorsense'), lineOfSight: true }, square(8));
      expect(exploredShapes({ all: false, regions: [seen, felt] }, { ambient: 1 }, [darkness])?.except).toEqual({ areas: [darkness.polygon], unless: [] });
    });

    it('records as before without a darkness source', () => {
      expect(exploredShapes(sight, { ambient: 0 }, [torch])).not.toHaveProperty('except');
    });
  });
});
