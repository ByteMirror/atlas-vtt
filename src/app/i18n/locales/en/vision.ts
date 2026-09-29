import type { Message } from '../../types';

export const vision = {
  'vision.range': 'Sight range',
  'vision.darkvision': 'Darkvision',
  'vision.tremorsense': 'Tremorsense',
  'vision.angle': 'Vision angle (°)',
  'vision.unlimited': 'Unlimited',
  'vision.none': 'None',
  'vision.unlimitedSight': 'Unlimited sight',
  'vision.noDarkvision': 'No darkvision',
  'vision.noTremorsense': 'No tremorsense',
  'vision.allAround': 'See all around',
  'vision.angleHint': 'Faces the token\'s rotation',
  'vision.withUnit': '{label} ({unit})',
  'vision.sectionLabel': 'Vision & light',
  'vision.toggle': 'Vision',
  'vision.toggleOn': 'The token sees; players see what it sees',
  'vision.toggleOff': 'The token does not see',
  'vision.carriedLight': 'Carried light',
  'vision.carryLight': 'Carry light',
  'vision.defaultsIntro': 'New tokens start with these values; vision itself stays off until you switch it on for a token.',
} as const satisfies Record<string, Message>;
