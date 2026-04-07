'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, MapPin, X, Download } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { avg } from '@/lib/score';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/Card';
import { Label } from '@/components/Label';
import { Progress } from '@/components/Progress';
import jsPDF from 'jspdf';
import { GeocoderAutocomplete } from '@geoapify/geocoder-autocomplete';
import '@geoapify/geocoder-autocomplete/styles/minimal.css';

type AgeGroup = '16-22' | '23-30' | '';
type BlockKey =
  | 'urban'
  | 'mobility'
  | 'waste'
  | 'energy'
  | 'pollution'
  | 'governance';
type Step = 'home' | 'consent' | 'profile' | BlockKey | 'summary' | 'thanks';

type CategoryKey =
  | 'Green Leader'
  | 'Green in Progress'
  | 'Insufficient Transition'
  | 'Priority for Transformation';

type Profile = {
  email: string;
  city: string;
  neighbourhood: string;
  country: string;
  countryOther: string;
  frequency: string;
  ageGroup: AgeGroup;
  means: string[];
  meansOther: string;
};

type BlockState = {
  scores: number[];
  explanations: string[];
  mainProblemSingle: string;
  mainProblemMultiple: string[];
  mainProblemOtherText: string;
  suggestionText: string;
  policyAwareness: string;
  policyApplication: number | null;
  strategicPriority: string;
  problemImage: File | null;
  goodPracticeImage: File | null;
  locationName: string;
  googleMapsUrl: string;
  latitude: string;
  longitude: string;
};

type ProblemConfig = {
  mode: 'single' | 'multiple';
  label: string;
  options: string[];
};

type BlockConfig = {
  title: string;
  intro16: string;
  intro23: string;
  questions16: string[];
  questions23: string[];
  problem16?: ProblemConfig;
  suggestion16?: string;
  policy23?: string;
  policyApplication23?: string | null;
  strategicPriority23?: string;
};

type PriorityArea = {
  key: BlockKey;
  title: string;
  avg: number;
  label: string;
};

type SuggestedRoadmapItem = {
  area: BlockKey;
  title: string;
  score: number;
  label: string;
  short_term_action: string;
  medium_term_action: string;
};

const countries = ['Bulgaria', 'Cyprus', 'Lithuania', 'Romania', 'Spain', 'Other'];
const frequencies = ['Daily', '3–4 days a week', '1–2 days a week', 'Occasional'];
const meansOptions = ['Walking', 'Bicycle', 'Bus', 'Car', 'Other'];

const orderedBlocks: BlockKey[] = [
  'urban',
  'mobility',
  'waste',
  'energy',
  'pollution',
  'governance',
];

const SCALE_HELP =
  'Scale reference: 1 = Very poor / not available · 3 = acceptable but improvable · 5 = excellent / well developed';

const EXPLANATION_HELP =
  'Please briefly explain why you gave this score. (1–2 sentences)';

const VISUAL_EVIDENCE_HELP =
  'Visual Evidence: You can add up to two images related to the subject being evaluated. Remember not to include identifiable faces or personal data.';

function getCategoryFromScore(score: number): CategoryKey {
  if (score >= 4.26) return 'Green Leader';
  if (score >= 3.51) return 'Green in Progress';
  if (score >= 2.51) return 'Insufficient Transition';
  return 'Priority for Transformation';
}

function lowerCategory(category: CategoryKey, steps = 1): CategoryKey {
  const order: CategoryKey[] = [
    'Green Leader',
    'Green in Progress',
    'Insufficient Transition',
    'Priority for Transformation',
  ];
  const index = order.indexOf(category);
  return order[Math.min(index + steps, order.length - 1)];
}

function getAdjustedCategory(overallScore: number, blockValues: number[]): CategoryKey {
  let category = getCategoryFromScore(overallScore);

  const below25 = blockValues.filter((v) => v > 0 && v < 2.5).length;
  const below20 = blockValues.filter((v) => v > 0 && v < 2.0).length;

  if (below20 >= 3) {
    category = lowerCategory(category, 2);
  } else if (below25 >= 2) {
    category = lowerCategory(category, 1);
  }

  return category;
}

function getBlockLabel(score: number): string {
  if (score >= 4.1) return 'Strength';
  if (score >= 3.1) return 'Acceptable';
  if (score >= 2.1) return 'Needs Improvement';
  return 'Critical';
}

function getCategoryDescription(category: CategoryKey): string {
  switch (category) {
    case 'Green Leader':
      return 'The city shows a high level of urban sustainability and strong overall performance across most areas.';
    case 'Green in Progress':
      return 'The city shows visible progress, although important improvements are still needed in several areas.';
    case 'Insufficient Transition':
      return 'The city has some positive elements, but the current urban model still shows clear weaknesses and priority areas for improvement.';
    case 'Priority for Transformation':
      return 'The city needs significant changes to move towards a more sustainable, accessible and resilient model.';
    default:
      return '';
  }
}

function getAreaAction(area: BlockKey) {
  const actions: Record<BlockKey, { short: string; medium: string }> = {
    urban: {
      short:
        'Improve maintenance, accessibility and climate comfort in existing public spaces.',
      medium:
        'Redesign public spaces to increase universal accessibility, green areas and pedestrian quality.',
    },
    mobility: {
      short:
        'Improve safety, signage and everyday usability of sustainable mobility options.',
      medium:
        'Strengthen public transport, cycling infrastructure and intermodal connections.',
    },
    waste: {
      short:
        'Reinforce public information, signage and local awareness on waste separation and reduction.',
      medium:
        'Expand circular economy measures such as reuse, repair, composting and better collection systems.',
    },
    energy: {
      short:
        'Improve the efficiency and maintenance of lighting and existing urban energy systems.',
      medium:
        'Promote renewable energy and more efficient infrastructure in public spaces and buildings.',
    },
    pollution: {
      short:
        'Act on the most visible pollution hotspots through traffic, noise or local environmental control measures.',
      medium:
        'Develop structural actions to reduce emissions, noise and environmental degradation over time.',
    },
    governance: {
      short:
        'Improve access to public information and make citizen participation channels more visible and usable.',
      medium:
        'Strengthen governance through more accessible services and stable participation mechanisms for young people.',
    },
  };

  return actions[area];
}

const blockConfig: Record<BlockKey, BlockConfig> = {
  urban: {
    title: 'URBAN DESIGN AND PUBLIC SPACE',
    intro16:
      'In this part you will evaluate what the public spaces of your neighbourhood or city are like and if they are designed so that people can use them comfortably, safely and inclusively. The goal is to understand if your city is designed for people and what changes could make it more sustainable, accessible, and useful for everyone.',
    intro23:
      'In this section you will evaluate how public space is designed in your city, not only from your personal experience, but also taking into account whether there are municipal policies or plans that are actually being applied. The aim is to gain a more strategic and critical view of how urban space is planned and managed in your city and what medium-term improvements would be needed.',
    questions16: [
      'Shade and climate comfort in public spaces (presence of trees, shaded areas, fountains or other elements that help reduce heat)',
      'How would you evaluate the quality and continuity of sidewalks and pedestrian routes in your city?',
      'How would you evaluate the accessibility and maintenance of green areas in your city?',
      'How would you evaluate universal accessibility in your city (ramps, pedestrian crossings, signage, etc.)?',
    ],
    questions23: [
      'Shade and climate comfort in public spaces (presence of trees, shaded areas, fountains or other elements that help reduce heat)',
      'How would you evaluate the quality and continuity of sidewalks and pedestrian routes in your city?',
      'How would you evaluate the accessibility and maintenance of green areas in your city?',
      'How would you evaluate universal accessibility in your city (ramps, pedestrian crossings, signage, etc.)?',
    ],
    problem16: {
      mode: 'multiple',
      label:
        'What problems do you identify in urban design and public spaces in your neighbourhood or city? (Select all that apply)',
      options: [
        'Lack of adequate infrastructure',
        'It is badly maintained',
        'Not accessible or inclusive',
        'Its use is not understood',
        "It's not safe",
        'It does not exist',
        'Other',
      ],
    },
    suggestion16:
      'What are your suggestions for improving the public spaces in your city? (Example: More trees, Urban parks, Green corridors)',
    policy23:
      'Do you know of any municipal measures, plans or regulations related to urban design and the use of public space in your city?',
    policyApplication23:
      'If it exists, to what extent do you think it is applied consistently and effectively in public space?',
    strategicPriority23:
      'What structural change would you prioritize in the next 2–4 years to improve urban design and the use of public space in your city?',
  },

  mobility: {
    title: 'SUSTAINABLE MOBILITY',
    intro16:
      'In this part you will assess how you move around your city and if there are real and safe alternatives to the private car. The aim is to find out if your city facilitates more sustainable, safe and accessible mobility for everyone.',
    intro23:
      'In this section you will analyse the mobility of your city from a broader and more strategic perspective, assessing not only your daily experience, but also the public policies that exist. The aim is to identify whether the city is moving towards a more sustainable mobility model and what strategic improvements should be promoted.',
    questions16: [
      'How would you evaluate the public transport in your city in terms of availability?',
      'Cycling infrastructure (lanes, security, bike parking)',
      'Road Safety (Level Crossings, Speed, Hotspots)',
      'How would you evaluate the connections between different transport options in your city (public transport, transfer points, connections between modes, etc.)',
    ],
    questions23: [
      'How would you evaluate the public transport in your city in terms of availability?',
      'Cycling infrastructure (lanes, security, bike parking)',
      'Road Safety (Level Crossings, Speed, Hotspots)',
      'How would you evaluate the connections between different transport options in your city (public transport, transfer points, connections between modes, etc.)',
    ],
    problem16: {
      mode: 'single',
      label:
        'What is currently most lacking in the sustainable mobility of your city? (choose only one option)',
      options: [
        'Lack of infrastructure (bike lanes, sidewalks, public transport, etc.)',
        'The infrastructure exists, but it is badly maintained',
        'Information and signage are not understood',
        'It is unsafe for pedestrians and/or cyclists',
        'There is no real alternative to the private car',
        'Other',
      ],
    },
    suggestion16:
      'What are your suggestions for improving the mobility in your city? (Ex: Cycle lanes, Public transport, Pedestrian streets)',
    policy23:
      'Do you know of any municipal measures or plans related to sustainable mobility (public transport, bike lanes, pedestrian areas, electric mobility, etc.)?',
    policyApplication23:
      'If so, how would you assess its actual implementation in your municipality?',
    strategicPriority23:
      'In the next 2–4 years, what change should be prioritised to improve sustainable mobility in your city?',
  },

  waste: {
    title: 'WASTE AND CIRCULAR ECONOMY',
    intro16:
      'In this part you are going to evaluate how waste is managed in your city and whether a circular economy (reduce, reuse and recycle) is really promoted. The goal is to find out if your city makes it easier for people to recycle and reduce waste in a simple and effective way.',
    intro23:
      'In this section you will evaluate how waste is managed in your city and whether you are really moving towards a circular economy model. The aim is to gain a critical view on whether the municipality is managing waste sustainably and what strategic improvements would be needed to move towards a real circular economy.',
    questions16: [
      'Are there containers available in your city to collect different types of waste? (Containers Available, Clarity)',
      'Urban cleanliness and street cleaning services (waste collection, street cleaning, prevention of litter)',
      'Reuse and repair (recycling centres, services, initiatives)',
      'How would you evaluate the information provided to citizens about waste separation (signage on containers, awareness campaigns, guidelines or regulations)',
    ],
    questions23: [
      'Are there containers available in your city to collect different types of waste? (Containers Available, Clarity)',
      'Urban cleanliness and street cleaning services (waste collection, street cleaning, prevention of litter)',
      'Reuse and repair (recycling centres, services, initiatives)',
      'How would you evaluate the information provided to citizens about waste separation (signage on containers, awareness campaigns, guidelines or regulations) [1.1][2.1]',
    ],
    problem16: {
      mode: 'single',
      label:
        'What is most lacking in waste management and the circular economy in your city or neighbourhood? (choose 1)',
      options: [
        'Lack of adequate infrastructure',
        'The infrastructure exists, but it is badly maintained',
        'The system is not understood (rules, separation, schedules, collection points)',
        'Lack of information and environmental education',
        'Is uncomfortable or inaccessible',
        'There is no visible circular economy system',
        'Other',
      ],
    },
    suggestion16:
      'What are your suggestions for improving the move towards a more efficient circular economy? (Urban reuse, Smart bins, Urban composting)',
    policy23:
      'Are you aware of any programmes, policies or initiatives implemented by your city related to waste management and the circular economy?',
    policyApplication23:
      'If so, how would you assess its actual implementation in the municipality?',
    strategicPriority23:
      'Over the next 2-4 years, what changes do you think should be prioritised to improve waste management and promote a circular economy in your city?',
  },

  energy: {
    title: 'INFRASTRUCTURE / URBAN ENERGY',
    intro16:
      'In this part you will evaluate how energy works in your city and if the infrastructures are adapted to a more modern and sustainable model. The aim is to find out if your city is moving towards a more efficient, safe and sustainable energy model.',
    intro23:
      'In this section you will analyse how your city manages energy and whether urban infrastructures are adapted to a more efficient and sustainable model. The objective is to evaluate whether the municipality is moving towards a more modern, sustainable and accessible energy system for citizens.',
    questions16: [
      'How would you evaluate the efficiency of public lighting and urban energy equipment in your city? Lighting/Equipment Efficiency (Perception of Modernization)',
      'Are sustainable energy sources used in your city? Local renewable or energy initiatives (visible/known)',
      'Quality of public lighting at night (adequate lighting without excessive brightness)',
    ],
    questions23: [
      'How would you evaluate the efficiency of public lighting and urban energy equipment in your city? Lighting/Equipment Efficiency (Perception of Modernization)',
      'Are sustainable energy sources used in your city? Local renewable or energy initiatives (visible/known)',
      'Quality of public lighting at night (adequate lighting without excessive brightness)',
    ],
    problem16: {
      mode: 'single',
      label:
        'What is most lacking in the energy-related urban infrastructure in your city? (choose 1)',
      options: [
        'Lack of efficient energy infrastructure',
        'Obsolete or badly maintained facilities',
        'Unclear use or bad signage',
        'Security issues',
        'There is no adequate infrastructure',
        'Other',
      ],
    },
    suggestion16:
      'What are your suggestions for improving the urban energy infrastructure more sustainable and efficient? (Ex. Solar energy, Energy-efficient buildings, LED lighting)',
    policy23:
      'Do you know of any municipal infrastructure or measures related to energy efficiency, renewable energies or energy saving in the city?',
    policyApplication23:
      'If it exists, how would you assess its application and continuity in the real world over time?',
    strategicPriority23:
      'In the next 2–4 years, what change should the municipality prioritise to improve sustainable energy or urban infrastructure in your city?',
  },

  pollution: {
    title: 'POLLUTION (air/noise/water)',
    intro16:
      'In this part you will evaluate if there are pollution problems in your environment and how they affect the quality of life. The aim is to identify what type of pollution affects your city the most and what measures could improve the environment.',
    intro23:
      'In this section you will assess the main pollution problems in your city, combining your direct experience with a more strategic vision. The objective is to identify whether there are real policies to improve environmental quality and what transformations should be promoted.',
    questions16: [
      'How is the noise level in your city? (traffic/leisure/residential areas)',
      'How is the air quality in your city? (Smoke/Smells/High Traffic Areas)',
      'How is the water quality in rivers/lakes in your city?',
    ],
    questions23: [
      'How is the noise level in your city? (traffic/leisure/residential areas)',
      'How is the air quality in your city? (Smoke/Smells/High Traffic Areas)',
      'How is the water quality in rivers/lakes in your city?',
    ],
    problem16: {
      mode: 'single',
      label: 'What is the main pollution problem in your city? (choose 1)',
      options: [
        'Air (traffic, industries, odours)',
        'Noise',
        'Water (rivers, beaches, wastewater)',
        'Soil (landfill, abandoned waste)',
        'Not perceived problems',
        'Others',
      ],
    },
    suggestion16:
      'What are your suggestions for reducing pollution in your city? (Ex. Less traffic, Less noise, Clean rivers)',
    policy23:
      'Do you know of any measures, regulations or municipal plans to reduce air, noise or water pollution in your city?',
    policyApplication23: null,
    strategicPriority23:
      'Thinking about the next 2–4 years, what change do you consider most important to reduce pollution in your city?',
  },

  governance: {
    title: 'ACCESS TO SERVICES AND GOVERNANCE',
    intro16:
      'In this part, you will assess whether your city facilitates access to basic services and whether young people can actually participate in decisions. The objective is to know if the city is accessible, transparent and open to the participation of young people.',
    intro23:
      "In this part, you're going to look at how your city works in terms of access to public services and citizen participation. The aim is to assess whether the municipality is accessible, transparent and open to participation, and what strategic improvements would be needed to strengthen local governance.",
    questions16: [
      'How easy is it to access essential services in your city (health, education, leisure, daily errands) without using a car?',
      'How would you evaluate the public information provided by local authorities (data, public campaigns, clarity of information about services and policies)?',
      'How would you evaluate the opportunities for young people to participate in decision-making in your city (e.g., channels to propose ideas, consultations, youth councils)?',
    ],
    questions23: [
      'How easy is it to access essential services in your city (health, education, leisure, daily errands) without using a car?',
      'How would you evaluate the public information provided by local authorities (data, public campaigns, clarity of information about services and policies)?',
      'How would you evaluate the opportunities for young people to participate in decision-making in your city (e.g., channels to propose ideas, consultations, youth councils)?',
    ],
    problem16: {
      mode: 'single',
      label:
        'What main problem do you detect in access to public services and local governance? (choose an option)',
      options: [
        'Difficulty accessing information',
        'Overly complex procedures',
        'Lack of coordination between administrations',
        'Insufficient or non-existent services',
        'Lack of citizen participation',
        'Others',
      ],
    },
    suggestion16:
      'What specific change would you suggest improving the environmental sustainability of your city and move towards a greener city model? (Ex. Citizen participation, Sustainable city, Environmental management)',
    policy23:
      'Do you know of any measures, plans or municipal policies related to access to public services and governance?',
    policyApplication23:
      'If it exists, to what extent do you think it is applied effectively and consistently in the municipality?',
    strategicPriority23:
      'In the next 2–4 years, what change do you consider a priority to improve access to public services and citizen participation in decisions in your city?',
  },
};

function emptyBlock(): BlockState {
  return {
    scores: [],
    explanations: [],
    mainProblemSingle: '',
    mainProblemMultiple: [],
    mainProblemOtherText: '',
    suggestionText: '',
    policyAwareness: '',
    policyApplication: null,
    strategicPriority: '',
    problemImage: null,
    goodPracticeImage: null,
    locationName: '',
    googleMapsUrl: '',
    latitude: '',
    longitude: '',
  };
}

function ScoreButtons({
  value,
  onChange,
}: {
  value?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          key={n}
          type="button"
          variant={value === n ? 'default' : 'outline'}
          onClick={() => onChange(n)}
        >
          {n}
        </Button>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [step, setStep] = useState<Step>('home');
  const [consent, setConsent] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
const [blockError, setBlockError] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<Profile>({
    email: '',
    city: '',
    neighbourhood: '',
    country: '',
    countryOther: '',
    frequency: '',
    ageGroup: '',
    means: [],
    meansOther: '',
  });

const [profileError, setProfileError] = useState('');
const autocompleteRefs = useRef<Record<string, HTMLDivElement | null>>({});
const getBlockValidationMessage = (block: BlockKey) => {
  const cfg = blockConfig[block];
  const state = blocks[block];
  const isOlder = profile.ageGroup === '23-30';
  const questions = isOlder ? cfg.questions23 : cfg.questions16;

  const missingLikert = questions.some(
    (_, idx) => typeof state.scores[idx] !== 'number'
  );

  if (missingLikert) {
    return 'Please complete all required rating questions before continuing.';
  }

  if (!isOlder) {
    if (cfg.problem16?.mode === 'single' && !state.mainProblemSingle) {
      return 'Please answer the required selection question before continuing.';
    }

    if (
      cfg.problem16?.mode === 'multiple' &&
      (!state.mainProblemMultiple || state.mainProblemMultiple.length === 0)
    ) {
      return 'Please select at least one option before continuing.';
    }

    const needsOtherTextSingle =
      state.mainProblemSingle === 'Other' || state.mainProblemSingle === 'Others';

    const needsOtherTextMultiple =
      state.mainProblemMultiple.includes('Other') ||
      state.mainProblemMultiple.includes('Others');

    if (
      (needsOtherTextSingle || needsOtherTextMultiple) &&
      !state.mainProblemOtherText.trim()
    ) {
      return 'Please specify the “Other” option before continuing.';
    }
  }

  if (isOlder) {
    if (cfg.policy23 && !state.policyAwareness) {
      return 'Please answer the policy question before continuing.';
    }

    if (cfg.policyApplication23 && typeof state.policyApplication !== 'number') {
      return 'Please rate the policy application question before continuing.';
    }
  }

  return '';
};

  const [blocks, setBlocks] = useState<Record<BlockKey, BlockState>>({
    urban: emptyBlock(),
    mobility: emptyBlock(),
    waste: emptyBlock(),
    energy: emptyBlock(),
    pollution: emptyBlock(),
    governance: emptyBlock(),
  });

  const blockScores = orderedBlocks.map((key) => ({
    key,
    title: blockConfig[key].title,
    avg: avg(blocks[key].scores.filter(Boolean)),
    label: getBlockLabel(avg(blocks[key].scores.filter(Boolean))),
  }));

  const overallScore = avg(blockScores.map((b) => b.avg).filter(Boolean));
  const overallCategory = getAdjustedCategory(
    overallScore,
    blockScores.map((b) => b.avg)
  );
  const overallDescription = getCategoryDescription(overallCategory);

  const sortedBlocks = [...blockScores]
    .filter((b) => b.avg > 0)
    .sort((a, b) => a.avg - b.avg);

  const priorityAreas: PriorityArea[] = sortedBlocks.slice(0, 2);

  if (
    sortedBlocks[2] &&
    sortedBlocks[1] &&
    (sortedBlocks[2].avg < 3.0 ||
      Math.abs(sortedBlocks[2].avg - sortedBlocks[1].avg) <= 0.2)
  ) {
    priorityAreas.push(sortedBlocks[2]);
  }

  const strengths = [...blockScores]
    .filter((b) => b.avg > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(-2)
    .reverse();

  const scoresSummary = {
    urban: blockScores.find((b) => b.key === 'urban')?.avg || 0,
    mobility: blockScores.find((b) => b.key === 'mobility')?.avg || 0,
    waste: blockScores.find((b) => b.key === 'waste')?.avg || 0,
    energy: blockScores.find((b) => b.key === 'energy')?.avg || 0,
    pollution: blockScores.find((b) => b.key === 'pollution')?.avg || 0,
    governance: blockScores.find((b) => b.key === 'governance')?.avg || 0,
  };

  const suggestionsSummary = {
    urban: blocks.urban.suggestionText || null,
    mobility: blocks.mobility.suggestionText || null,
    waste: blocks.waste.suggestionText || null,
    energy: blocks.energy.suggestionText || null,
    pollution: blocks.pollution.suggestionText || null,
    governance: blocks.governance.suggestionText || null,
  };

  const suggestedRoadmap: SuggestedRoadmapItem[] = priorityAreas.map((item) => {
    const actions = getAreaAction(item.key);
    return {
      area: item.key,
      title: item.title,
      score: item.avg,
      label: item.label,
      short_term_action: actions.short,
      medium_term_action: actions.medium,
    };
  });

  const primaryShortTermAction =
    priorityAreas.length > 0 ? getAreaAction(priorityAreas[0].key).short : null;

  const primaryMediumTermAction =
    priorityAreas.length > 0 ? getAreaAction(priorityAreas[0].key).medium : null;

  const progress = useMemo(() => {
    const steps: Step[] = ['home', 'consent', 'profile', ...orderedBlocks, 'summary', 'thanks'];
    return Math.round((steps.indexOf(step) / (steps.length - 1)) * 100);
  }, [step]);

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const isProfileValid =
  isValidEmail(profile.email) &&
  profile.city.trim() !== '' &&
  profile.neighbourhood.trim() !== '' &&
  profile.country.trim() !== '' &&
  (profile.country !== 'Other' || profile.countryOther.trim() !== '') &&
  profile.frequency.trim() !== '' &&
  profile.ageGroup !== '' &&
  profile.means.length > 0 &&
  (!profile.means.includes('Other') || profile.meansOther.trim() !== '');

  const isBlockValid = (block: BlockKey) => {
  const cfg = blockConfig[block];
  const state = blocks[block];
  const isOlder = profile.ageGroup === '23-30';
  const questions = isOlder ? cfg.questions23 : cfg.questions16;

  const allLikertAnswered = questions.every(
    (_, idx) => typeof state.scores[idx] === 'number'
  );

  if (!allLikertAnswered) return false;

  if (!isOlder) {
    if (cfg.problem16?.mode === 'single' && !state.mainProblemSingle) return false;

    if (
      cfg.problem16?.mode === 'multiple' &&
      (!state.mainProblemMultiple || state.mainProblemMultiple.length === 0)
    ) {
      return false;
    }

    const needsOtherTextSingle =
      state.mainProblemSingle === 'Other' || state.mainProblemSingle === 'Others';

    const needsOtherTextMultiple =
      state.mainProblemMultiple.includes('Other') ||
      state.mainProblemMultiple.includes('Others');

    if (
      (needsOtherTextSingle || needsOtherTextMultiple) &&
      !state.mainProblemOtherText.trim()
    ) {
      return false;
    }
  }

  if (isOlder) {
    if (cfg.policy23 && !state.policyAwareness) return false;

    if (cfg.policyApplication23 && typeof state.policyApplication !== 'number') {
      return false;
    }
  }

  return true;
};

  const updateBlock = (block: BlockKey, patch: Partial<BlockState>) => {
    setBlocks((prev) => ({
      ...prev,
      [block]: { ...prev[block], ...patch },
    }));
  };

  const removeImageForBlock = (
    block: BlockKey,
    type: 'problemImage' | 'goodPracticeImage'
  ) => {
    updateBlock(block, { [type]: null } as Partial<BlockState>);
  };

  const getCurrentLocationForBlock = (block: BlockKey) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateBlock(block, {
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        });
      },
      () => {
        alert('Location could not be obtained. Please allow location access in your browser.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };


  useEffect(() => {
  if (!orderedBlocks.includes(step as BlockKey)) return;

  const block = step as BlockKey;
  const container = autocompleteRefs.current[block];
  if (!container) return;

  container.innerHTML = '';

  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
  if (!apiKey) {
    console.error('Missing NEXT_PUBLIC_GEOAPIFY_API_KEY');
    return;
  }

  const autocomplete = new GeocoderAutocomplete(container, apiKey, {
    placeholder: 'Search place...',
    lang: 'en',
    limit: 5,
  });

  autocomplete.on('select', (feature: any) => {
    const props = feature?.properties;
    const coords = feature?.geometry?.coordinates;

    updateBlock(block, {
      locationName:
        props?.formatted ||
        props?.address_line1 ||
        props?.name ||
        '',
      latitude: coords?.[1] != null ? String(coords[1]) : '',
      longitude: coords?.[0] != null ? String(coords[0]) : '',
    });
  });

  return () => {
    container.innerHTML = '';
  };
}, [step]);

const loadImageAsDataUrl = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });

  
 const downloadSummary = async () => {
  const doc = new jsPDF();

  const finalCountry =
    profile.country === 'Other' && profile.countryOther.trim()
      ? profile.countryOther.trim()
      : profile.country;

  const logoGreen = await loadImageAsDataUrl('/GreenYouth.png');
  const logoEU = await loadImageAsDataUrl('/uew.png');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 20;

  const addPageHeader = () => {
    doc.setFillColor(16, 71, 47);
    doc.rect(0, 0, pageWidth, 32, 'F');

    doc.addImage(logoGreen, 'PNG', 14, 6, 35, 10);
    doc.addImage(logoEU, 'PNG', pageWidth - 40, 6, 30, 10);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Green Cities Audit Summary', pageWidth / 2, 18, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    y = 42;
  };

  const checkPageBreak = (needed = 12) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      addPageHeader();
    }
  };

  const addSectionTitle = (title: string) => {
    checkPageBreak(14);
    doc.setFillColor(240, 247, 242);
    doc.roundedRect(margin, y - 5, pageWidth - margin * 2, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(16, 71, 47);
    doc.text(title, margin + 4, y + 2);
    doc.setTextColor(0, 0, 0);
    y += 12;
  };

  const addParagraph = (text: string, fontSize = 11) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    checkPageBreak(lines.length * 6 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 6 + 4;
  };

  const addInfoBox = (label: string, value: string) => {
    checkPageBreak(16);
    doc.setDrawColor(220, 228, 223);
    doc.roundedRect(margin, y - 4, pageWidth - margin * 2, 12, 2, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${label}:`, margin + 4, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '-', margin + 34, y + 3);
    y += 16;
  };

  const addRoadmapCard = (
    title: string,
    score: string,
    shortTerm: string,
    mediumTerm: string
  ) => {
    const shortLines = doc.splitTextToSize(`Short-term: ${shortTerm}`, 170);
    const mediumLines = doc.splitTextToSize(`Medium-term: ${mediumTerm}`, 170);
    const titleLines = doc.splitTextToSize(title, 170);

    const boxHeight =
      10 + titleLines.length * 5 + shortLines.length * 5 + mediumLines.length * 5 + 10;

    checkPageBreak(boxHeight);

    doc.setDrawColor(200, 220, 205);
    doc.setFillColor(250, 252, 250);
    doc.roundedRect(margin, y - 4, pageWidth - margin * 2, boxHeight, 3, 3, 'FD');

    let innerY = y + 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(titleLines, margin + 4, innerY);

    innerY += titleLines.length * 5 + 2;
    doc.setFont('helvetica', 'normal');
    doc.text(`Score: ${score}`, margin + 4, innerY);

    innerY += 6;
    doc.text(shortLines, margin + 4, innerY);

    innerY += shortLines.length * 5 + 2;
    doc.text(mediumLines, margin + 4, innerY);

    y += boxHeight + 6;
  };

  addPageHeader();

  addSectionTitle('General Information');
  addInfoBox('City', profile.city || '-');
  addInfoBox('Country', finalCountry || '-');
  addInfoBox('Overall score', `${overallScore || '-'} / 5`);
  addInfoBox('Overall result', overallCategory || '-');

  addSectionTitle('Interpretation');
  addParagraph(overallDescription || '-');

  addSectionTitle('Priority Areas');
  if (priorityAreas.length) {
    priorityAreas.forEach((item, idx) => {
      addParagraph(`${idx + 1}. ${item.title} — Score: ${item.avg} (${item.label})`);
    });
  } else {
    addParagraph('No priority areas detected.');
  }

  addSectionTitle('Suggested Roadmap');
  if (suggestedRoadmap.length) {
    suggestedRoadmap.forEach((item, idx) => {
      addRoadmapCard(
        `Priority ${idx + 1}: ${item.title}`,
        `${item.score} (${item.label})`,
        item.short_term_action,
        item.medium_term_action
      );
    });
  } else {
    addParagraph('No roadmap generated yet.');
  }

  addSectionTitle('Scores by Area');
  blockScores.forEach((b) => {
    addParagraph(`${b.title}: ${b.avg || 0} / 5 (${b.label})`);
  });

  doc.save(`green-cities-summary-${profile.city || 'city'}.pdf`);
};
      const uploadImage = async (
    file: File,
    submissionId: string,
    block: BlockKey,
    mediaType: 'problem' | 'good_practice'
  ) => {
    const ext = file.name.split('.').pop();
    const filePath = `${submissionId}/${block}/${mediaType}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('audit-images').upload(filePath, file);
    if (error) throw error;
    const { data } = supabase.storage.from('audit-images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const submitAll = async () => {
    try {
      setLoading(true);

      const finalCountry =
        profile.country === 'Other' && profile.countryOther.trim()
          ? `Other: ${profile.countryOther.trim()}`
          : profile.country || null;

      const { data: submission, error: submissionError } = await supabase
        .from('submissions')
        .insert({
          email: profile.email,
          city: profile.city,
          neighbourhood: profile.neighbourhood,
          country: finalCountry,
          frequency: profile.frequency,
          age_group: profile.ageGroup,
          consent_accepted: consent ?? false,
          overall_score: overallScore || null,
          overall_result: overallCategory || null,
          interpretation: overallDescription || null,
          priority_area_1: priorityAreas[0]?.title || null,
          priority_area_2: priorityAreas[1]?.title || null,
          short_term_action: primaryShortTermAction,
          medium_term_action: primaryMediumTermAction,
          suggested_roadmap:
            suggestedRoadmap.length > 0
              ? JSON.parse(JSON.stringify(suggestedRoadmap))
              : null,
          scores_summary: scoresSummary,
          suggestions_summary: suggestionsSummary,
        })
        .select()
        .single();

      if (submissionError) throw new Error(`submissions: ${submissionError.message}`);

      if (suggestedRoadmap.length > 0) {
        const roadmapRows = suggestedRoadmap.map((item, index) => ({
          submission_id: submission.id,
          city: index === 0 ? profile.city || null : null,
          country: index === 0 ? finalCountry : null,
          overall_score: index === 0 ? overallScore || null : null,
          priority_areas:
            index === 0
              ? priorityAreas.length > 0
                ? priorityAreas.map((p, i) => `Priority ${i + 1}: ${p.title}`).join(' | ')
                : null
              : null,
          roadmap_text:
            `Priority ${index + 1}: ${item.title}. ` +
            `According to the audit results, this area should be addressed as part of the city’s short- and medium-term sustainability strategy. ` +
            `In the short term, it is recommended to: ${item.short_term_action} ` +
            `In the medium term, it is recommended to: ${item.medium_term_action}`,
          roadmap_pdf_url: null,
          priority_order: index + 1,
          area: item.area,
          title: item.title,
          score: item.score,
          label: item.label,
          short_term_action: item.short_term_action,
          medium_term_action: item.medium_term_action,
        }));

        const { error: roadmapError } = await supabase
          .from('roadmaps')
          .insert(roadmapRows);

        if (roadmapError) throw new Error(`roadmaps: ${roadmapError.message}`);
      }

      if (profile.means.length) {
        const meansRows = profile.means.map((m) => ({
          submission_id: submission.id,
          means:
            m === 'Other' && profile.meansOther.trim()
              ? `Other: ${profile.meansOther.trim()}`
              : m,
        }));
        const { error: meansError } = await supabase.from('submission_means').insert(meansRows);
        if (meansError) throw new Error(`submission_means: ${meansError.message}`);
      }

      const getBlockPrefix = (block: BlockKey) => {
        if (block === 'urban') return 'A';
        if (block === 'mobility') return 'B';
        if (block === 'waste') return 'C';
        if (block === 'energy') return 'D';
        if (block === 'pollution') return 'E';
        if (block === 'governance') return 'F';
        return 'X';
      };

      const getIndicatorNamesForBlock = (blockName: string) => {
        const upper = blockName.toUpperCase();

        if (upper.includes('URBAN DESIGN')) {
          return [
            'Shade and climate comfort in public spaces',
            'Quality and continuity of sidewalks and pedestrian routes',
            'Accessibility and maintenance of green areas',
            'Universal accessibility',
          ];
        }

        if (upper.includes('SUSTAINABLE MOBILITY')) {
          return [
            'Public transport availability',
            'Cycling infrastructure',
            'Road safety',
            'Connections between transport options',
          ];
        }

        if (upper.includes('WASTE')) {
          return [
            'Availability and clarity of waste containers',
            'Urban cleanliness and street cleaning services',
            'Reuse and repair initiatives',
            'Information for citizens about waste separation',
          ];
        }

        if (upper.includes('INFRASTRUCTURE') || upper.includes('ENERGY')) {
          return [
            'Efficiency of public lighting and energy equipment',
            'Visible use of sustainable energy sources',
            'Quality of public lighting at night',
            'Additional infrastructure / energy indicator',
          ];
        }

        if (upper.includes('POLLUTION')) {
          return [
            'Noise level',
            'Air quality',
            'Water quality in rivers/lakes',
            'Additional pollution indicator',
          ];
        }

        if (upper.includes('ACCESS TO SERVICES') || upper.includes('GOVERNANCE')) {
          return [
            'Access to essential services without a car',
            'Quality of public information by local authorities',
            'Opportunities for youth participation',
            'Additional governance indicator',
          ];
        }

        return ['Indicator 1', 'Indicator 2', 'Indicator 3', 'Indicator 4'];
      };

      for (const block of orderedBlocks) {
        const state = blocks[block];

        const blockInsert = {
          submission_id: submission.id,
          block_name: block,
          age_group: profile.ageGroup || null,
          country: finalCountry,
          city: profile.city || null,

          q1_score: state.scores[0] || null,
          q1_text: state.explanations[0] || null,
          q2_score: state.scores[1] || null,
          q2_text: state.explanations[1] || null,
          q3_score: state.scores[2] || null,
          q3_text: state.explanations[2] || null,
          q4_score: state.scores[3] || null,
          q4_text: state.explanations[3] || null,

          main_problem:
            profile.ageGroup === '16-22'
              ? state.mainProblemSingle === 'Other' || state.mainProblemSingle === 'Others'
                ? state.mainProblemOtherText.trim()
                  ? `Other: ${state.mainProblemOtherText.trim()}`
                  : state.mainProblemSingle
                : state.mainProblemSingle || null
              : null,

          problem_options:
            profile.ageGroup === '16-22' && state.mainProblemMultiple.length > 0
              ? state.mainProblemMultiple.map((option) =>
                  option === 'Other' || option === 'Others'
                    ? state.mainProblemOtherText.trim()
                      ? `Other: ${state.mainProblemOtherText.trim()}`
                      : option
                    : option
                )
              : null,

          suggestion:
            profile.ageGroup === '16-22' ? state.suggestionText || null : null,

          suggestion_text:
            profile.ageGroup === '16-22' ? state.suggestionText || null : null,

          policy_awareness:
            profile.ageGroup === '23-30' ? state.policyAwareness || null : null,

          policy_application_score:
            profile.ageGroup === '23-30' ? state.policyApplication || null : null,

          strategic_priority:
            profile.ageGroup === '23-30' ? state.strategicPriority || null : null,

          block_score: avg(state.scores.filter(Boolean)) || null,
        };

        const { error: blockResponseError } = await supabase
          .from('block_responses')
          .insert(blockInsert);

        if (blockResponseError) throw new Error(`block_responses: ${blockResponseError.message}`);

        const blockPrefix = getBlockPrefix(block);
        const indicatorNames = getIndicatorNamesForBlock(blockConfig[block].title);

        const itemRows = state.scores
          .map((score, index) => {
            const numericScore = typeof score === 'number' ? score : null;
            if (numericScore === null) return null;

            return {
              submission_id: submission.id,
              block_name: block,
              item_code: `${blockPrefix}${index + 1}`,
              item_question: indicatorNames[index] || `Indicator ${index + 1}`,
              item_order: index + 1,
              score: numericScore,
              explanation: state.explanations[index] || null,
              city: profile.city || null,
              country: finalCountry,
              age_group: profile.ageGroup || null,
            };
          })
          .filter(Boolean);

        if (itemRows.length) {
          const { error: itemError } = await supabase
            .from('item_responses')
            .insert(itemRows);

          if (itemError) throw new Error(`item_responses: ${itemError.message}`);
        }

        const mediaRows: Array<{
          submission_id: string;
          block_name: BlockKey;
          media_type: 'problem' | 'good_practice';
          image_url: string;
          location_name: string | null;
          latitude: number | null;
          longitude: number | null;
        }> = [];

        if (state.problemImage) {
          const problemUrl = await uploadImage(
            state.problemImage,
            submission.id,
            block,
            'problem'
          );
          mediaRows.push({
            submission_id: submission.id,
            block_name: block,
            media_type: 'problem',
            image_url: problemUrl,
            location_name: state.locationName || state.googleMapsUrl || null,
            latitude: state.latitude ? Number(state.latitude) : null,
            longitude: state.longitude ? Number(state.longitude) : null,
          });
        }

        if (state.goodPracticeImage) {
          const goodPracticeUrl = await uploadImage(
            state.goodPracticeImage,
            submission.id,
            block,
            'good_practice'
          );
          mediaRows.push({
            submission_id: submission.id,
            block_name: block,
            media_type: 'good_practice',
            image_url: goodPracticeUrl,
            location_name: state.locationName || state.googleMapsUrl || null,
            latitude: state.latitude ? Number(state.latitude) : null,
            longitude: state.longitude ? Number(state.longitude) : null,
          });
        }

        if (mediaRows.length > 0) {
          const { error: mediaError } = await supabase
            .from('media_evidence')
            .insert(mediaRows);
          if (mediaError) throw new Error(`media_evidence: ${mediaError.message}`);
        }
      }

      setStep('thanks');
    } catch (e: any) {
      console.error('RAW ERROR:', e);
      alert(
        e?.message ||
          e?.details ||
          e?.hint ||
          'Error saving submission'
      );
    } finally {
      setLoading(false);
    }
  };

  const renderProblemField = (block: BlockKey) => {
    const cfg = blockConfig[block];
    const state = blocks[block];

    if (!cfg.problem16) return null;

    const showOtherInput =
      (cfg.problem16.mode === 'single' &&
        (state.mainProblemSingle === 'Other' || state.mainProblemSingle === 'Others')) ||
      (cfg.problem16.mode === 'multiple' &&
        (state.mainProblemMultiple.includes('Other') ||
          state.mainProblemMultiple.includes('Others')));

    return (
      <div className="rounded-2xl border p-4 space-y-4">
        <Label>{cfg.problem16.label} *</Label>

        {cfg.problem16.mode === 'single' ? (
          <div className="grid gap-3">
            {cfg.problem16.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${block}-problem`}
                  checked={state.mainProblemSingle === option}
                  onChange={() =>
                    updateBlock(block, {
                      mainProblemSingle: option,
                    })
                  }
                />
                {option}
              </label>
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {cfg.problem16.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.mainProblemMultiple.includes(option)}
                  onChange={(e) => {
                    const current = state.mainProblemMultiple;
                    const next = e.target.checked
                      ? [...current, option]
                      : current.filter((v) => v !== option);
                    updateBlock(block, { mainProblemMultiple: next });
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        )}

        {showOtherInput && (
          <div className="mt-3">
            <Label>Please specify *</Label>
            <Input
              value={state.mainProblemOtherText}
              onChange={(e) =>
                updateBlock(block, { mainProblemOtherText: e.target.value })
              }
              placeholder="Type your answer"
            />
          </div>
        )}
      </div>
    );
  };

  const renderQuestionSet = (block: BlockKey) => {
    const cfg = blockConfig[block];
    const state = blocks[block];
    const isOlder = profile.ageGroup === '23-30';
    const questions = isOlder ? cfg.questions23 : cfg.questions16;

    return (
      <Card key={block}>
        <CardHeader>
          <CardTitle>{cfg.title}</CardTitle>
          <CardDescription>{isOlder ? cfg.intro23 : cfg.intro16}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {questions.map((question, idx) => (
            <div key={idx} className="rounded-2xl border p-4 space-y-3">
              <Label>{question} *</Label>
              <p className="text-sm text-slate-500">{SCALE_HELP}</p>

              <ScoreButtons
                value={state.scores[idx]}
                onChange={(value) => {
                  const scores = [...state.scores];
                  scores[idx] = value;
                  updateBlock(block, { scores });
                }}
              />

              <div>
                <Label>{EXPLANATION_HELP}</Label>
                <Textarea
                  value={state.explanations[idx] || ''}
                  onChange={(e) => {
                    const explanations = [...state.explanations];
                    explanations[idx] = e.target.value;
                    updateBlock(block, { explanations });
                  }}
                />
              </div>
            </div>
          ))}

          {!isOlder && renderProblemField(block)}

          {!isOlder && cfg.suggestion16 && (
            <div className="rounded-2xl border p-4 space-y-3">
              <Label>{cfg.suggestion16}</Label>
              <p className="text-sm text-slate-500">(Answer in one sentence)</p>
              <Textarea
                value={state.suggestionText}
                onChange={(e) => updateBlock(block, { suggestionText: e.target.value })}
              />
            </div>
          )}

          {isOlder && cfg.policy23 && (
            <div className="rounded-2xl border p-4 space-y-4">
              <Label>{cfg.policy23} *</Label>
              <div className="grid gap-3">
                {['Yes', 'No', "I’m not sure"].map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`${block}-policy`}
                      checked={state.policyAwareness === option}
                      onChange={() => updateBlock(block, { policyAwareness: option })}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          )}

          {isOlder && cfg.policyApplication23 && (
            <div className="rounded-2xl border p-4 space-y-3">
              <Label>{cfg.policyApplication23} *</Label>
              <p className="text-sm text-slate-500">
                Scale reference: 1 = not applied / very poor · 5 = applied consistently and
                effectively
              </p>
              <ScoreButtons
                value={state.policyApplication || undefined}
                onChange={(value) => updateBlock(block, { policyApplication: value })}
              />
            </div>
          )}

          {isOlder && cfg.strategicPriority23 && (
            <div className="rounded-2xl border p-4 space-y-3">
              <Label>{cfg.strategicPriority23}</Label>
              <p className="text-sm text-slate-500">(Short answer – 1 or 2 sentences)</p>
              <Textarea
                value={state.strategicPriority}
                onChange={(e) => updateBlock(block, { strategicPriority: e.target.value })}
              />
            </div>
          )}

          <div className="rounded-2xl border p-4 space-y-4">
            <Label>Visual Evidence</Label>
            <p className="text-sm text-slate-500">{VISUAL_EVIDENCE_HELP}</p>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Upload a file of an image showing the main problem detected
                </Label>
                <Input
                  key={`${block}-problem-image`}
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    updateBlock(block, { problemImage: e.target.files?.[0] || null })
                  }
                />
                {state.problemImage && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 break-all">
                      Selected: {state.problemImage.name}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeImageForBlock(block, 'problemImage')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Upload a file of an image that reflects a good practice or something that works well in your city
                </Label>
                <Input
                  key={`${block}-goodpractice-image`}
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    updateBlock(block, { goodPracticeImage: e.target.files?.[0] || null })
                  }
                />
                {state.goodPracticeImage && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 break-all">
                      Selected: {state.goodPracticeImage.name}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeImageForBlock(block, 'goodPracticeImage')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1">
                  <Label>Location name</Label>
                  <Input
                    value={state.locationName}
                    onChange={(e) => updateBlock(block, { locationName: e.target.value })}
                    placeholder="Example: main square, central park, bus station..."
                  />
                </div>

                <div className="md:w-auto">
                  <Button
                    type="button"
                    onClick={() => getCurrentLocationForBlock(block)}
                    className="w-full md:w-auto"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Use my location
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
  <Label>Search place</Label>
  <div
    ref={(el) => {
      autocompleteRefs.current[block] = el;
    }}
    className="rounded-xl border border-slate-300 px-3 py-2"
    style={{ position: 'relative' }}
  />
  <p className="text-xs text-slate-500">
    Search for a place and select it from the suggestions.
  </p>
</div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Latitude</Label>
                  <Input value={state.latitude} readOnly />
                </div>

                <div>
                  <Label>Longitude</Label>
                  <Input value={state.longitude} readOnly />
                </div>
              </div>
            </div>
          </div>

          {!isBlockValid(block) && (
            <p className="text-sm text-amber-700">
              Please complete all required scores and selection questions before continuing.
            </p>
          )}

          {blockError[block] && (
  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {blockError[block]}
  </div>
)}


          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                const index = orderedBlocks.indexOf(block);
                if (index === 0) setStep('profile');
                else setStep(orderedBlocks[index - 1]);
              }}
            >
              Back
            </Button>

            <Button
  onClick={() => {
    if (!isBlockValid(block)) {
      setBlockError((prev) => ({
        ...prev,
        [block]: getBlockValidationMessage(block),
      }));
      return;
    }

    setBlockError((prev) => ({
      ...prev,
      [block]: '',
    }));

    const index = orderedBlocks.indexOf(block);
    if (index === orderedBlocks.length - 1) setStep('summary');
    else setStep(orderedBlocks[index + 1]);
  }}
>
  Continue
</Button>

          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-3xl bg-[#10472f] text-white p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Green Cities Audit Tool</h1>
              <p className="text-white/80 mt-2">
                Its intention is that you can analyse your city with a critical eye and realise
                what works well and what needs improvement in areas such as mobility, public
                spaces, waste, energy or pollution.
              </p>
            </div>

            <div className="flex items-center gap-4 md:gap-6 self-start md:self-center">
              <div className="bg-white rounded-2xl p-4">
                <Image
                  src="/logo-greencities.png"
                  alt="Green Cities logo"
                  width={400}
                  height={140}
                  className="object-contain"
                />
              </div>
              <div className="bg-white rounded-2xl p-4">
                <Image
                  src="/UEuropa.png"
                  alt="UEuropa logo"
                  width={300}
                  height={150}
                  className="object-contain"
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Progress value={progress} />
          </div>
        </div>

        {step === 'home' && (
          <Card>
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>
                When you complete the questionnaire, your answers will be used to get an
                overview of your city&apos;s level of sustainability and to identify real priorities
                for improvement. The ideas and proposals you contribute will be used to develop a
                roadmap with suggested actions that could contribute to moving towards a greener,
                more accessible and people-centred city.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                In this way, the information from the questionnaire is collected and transformed
                into organized proposals for improvement for the city.
              </p>
              <Button onClick={() => setStep('consent')}>Start audit</Button>
            </CardContent>
          </Card>
        )}

        {step === 'consent' && (
          <Card>
            <CardHeader>
              <CardTitle>Consent / Privacy</CardTitle>
              <CardDescription>
                Before you start, you have to accept a basic rule: Do not upload photos where
                faces are seen, do not share personal data. If you check &quot;I agree,&quot; you can
                continue. If you check &quot;I don&apos;t agree,&quot; you won&apos;t be able to participate.
                It&apos;s just to protect your privacy and the privacy of others.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <Button
                  variant={consent === true ? 'default' : 'outline'}
                  onClick={() => setConsent(true)}
                >
                  I agree. I will not upload photos with identifiable faces or personal
                  information.
                </Button>
                <Button
                  variant={consent === false ? 'default' : 'outline'}
                  onClick={() => setConsent(false)}
                >
                  I disagree
                </Button>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('home')}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(consent ? 'profile' : 'thanks')}
                  disabled={consent === null}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'profile' && (
          <Card>
            <CardHeader>
              <CardTitle>Section 3</CardTitle>
              <CardDescription>
                Let&apos;s get started. Here we just want to know a little about you and your
                relationship with the city. This part helps us understand your experience in the
                city.
              </CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
  <Label>Email *</Label>
  <Input
    type="email"
    required
    value={profile.email}
    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
    placeholder="name@example.com"
  />
</div>

              <div>
                <Label>City *</Label>
                <Input
                  value={profile.city}
                  onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                />
              </div>

              <div>
                <Label>Area / Neighbourhood *</Label>
                <Input
                  value={profile.neighbourhood}
                  onChange={(e) => setProfile({ ...profile, neighbourhood: e.target.value })}
                />
              </div>

              <div>
                <Label>Country *</Label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={profile.country}
                  onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                >
                  <option value="">Select</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {profile.country === 'Other' && (
                  <div className="mt-3">
                    <Label>Please specify country *</Label>
                    <Input
                      value={profile.countryOther}
                      onChange={(e) => setProfile({ ...profile, countryOther: e.target.value })}
                      placeholder="Type country name"
                    />
                  </div>
                )}
              </div>

              <div>
                <Label>How often do you go around town? *</Label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={profile.frequency}
                  onChange={(e) => setProfile({ ...profile, frequency: e.target.value })}
                >
                  <option value="">Select</option>
                  {frequencies.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Age group *</Label>
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={profile.ageGroup === '16-22'}
                      onChange={() => setProfile({ ...profile, ageGroup: '16-22' })}
                    />
                    Group 16–22
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={profile.ageGroup === '23-30'}
                      onChange={() => setProfile({ ...profile, ageGroup: '23-30' })}
                    />
                    Group 23–30
                  </label>
                </div>
              </div>

              <div className="md:col-span-2">
                <Label>Usual means *</Label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {meansOptions.map((m) => (
                    <label key={m} className="border rounded-xl p-3 flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={profile.means.includes(m)}
                        onChange={(e) =>
                          setProfile((prev) => ({
                            ...prev,
                            means: e.target.checked
                              ? [...prev.means, m]
                              : prev.means.filter((x) => x !== m),
                          }))
                        }
                      />
                      {m}
                    </label>
                  ))}
                </div>

                {profile.means.includes('Other') && (
                  <div className="mt-3">
                    <Label>Please specify other means *</Label>
                    <Input
                      value={profile.meansOther}
                      onChange={(e) => setProfile({ ...profile, meansOther: e.target.value })}
                      placeholder="Type other means of transport"
                    />
                  </div>
                )}
              </div>
                  {profileError && (
  <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {profileError}
  </div>
)}
              <div className="md:col-span-2 flex gap-3">
                <Button variant="outline" onClick={() => setStep('consent')}>
                  Back
                </Button>
 <Button
  onClick={() => {
    if (!profile.email.trim()) {
      setProfileError('Please enter your email address.');
      return;
    }

    if (!isValidEmail(profile.email)) {
      setProfileError('Please enter a valid email address.');
      return;
    }

    if (!isProfileValid) {
      setProfileError(
        'Please complete all required fields in this section before continuing.'
      );
      return;
    }

    setProfileError('');
    setStep('urban');
  }}
>
  Continue
</Button>

              </div>
            </CardContent>
          </Card>
        )}

        {orderedBlocks.includes(step as BlockKey) && renderQuestionSet(step as BlockKey)}

        {step === 'summary' && (
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>
                This summary translates the scores into an interpretable result and priority
                roadmap.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="border rounded-2xl p-4">
                  <p className="text-sm text-slate-500">City</p>
                  <p className="font-semibold">{profile.city || '—'}</p>
                </div>

                <div className="border rounded-2xl p-4">
                  <p className="text-sm text-slate-500">Overall score</p>
                  <p className="font-semibold">{overallScore || '—'} / 5</p>
                </div>

                <div className="border rounded-2xl p-4">
                  <p className="text-sm text-slate-500">Overall Result</p>
                  <p className="font-semibold">{overallCategory}</p>
                </div>
              </div>

              <div className="border rounded-2xl p-4">
                <p className="font-medium mb-2">Interpretation</p>
                <p className="text-sm text-slate-600">{overallDescription}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-2xl p-4">
                  <p className="font-medium mb-3">Strongest Areas</p>
                  <div className="space-y-2">
                    {strengths.length ? (
                      strengths.map((item) => (
                        <div key={item.key} className="flex justify-between text-sm gap-4">
                          <span>{item.title}</span>
                          <span>
                            {item.avg} · {item.label}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No scores available yet.</p>
                    )}
                  </div>
                </div>

                <div className="border rounded-2xl p-4">
                  <p className="font-medium mb-3">Priority Areas</p>
                  <div className="space-y-2">
                    {priorityAreas.length ? (
                      priorityAreas.map((item) => (
                        <div key={item.key} className="flex justify-between text-sm gap-4">
                          <span>{item.title}</span>
                          <span>
                            {item.avg} · {item.label}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No priorities detected yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border rounded-2xl p-4">
                <p className="font-medium mb-3">Suggested Roadmap (2–4 years)</p>
                <div className="space-y-4">
                  {priorityAreas.length ? (
                    priorityAreas.map((item, idx) => {
                      const actions = getAreaAction(item.key);
                      return (
                        <div key={item.key} className="rounded-xl border p-4">
                          <p className="font-medium">
                            Priority {idx + 1}: {item.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Score: {item.avg} · {item.label}
                          </p>
                          <div className="mt-3 space-y-2 text-sm">
                            <p>
                              <span className="font-medium">Short-term action:</span>{' '}
                              {actions.short}
                            </p>
                            <p>
                              <span className="font-medium">Medium-term action:</span>{' '}
                              {actions.medium}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">
                      Complete more answers to generate roadmap priorities.
                    </p>
                  )}
                </div>
              </div>

              <div className="border rounded-2xl p-4">
                <p className="font-medium mb-3">Scores by Area</p>
                <div className="space-y-2">
                  {blockScores.map((b) => (
                    <div key={b.key} className="flex justify-between text-sm gap-4">
                      <span>{b.title}</span>
                      <span>
                        {b.avg || 0} / 5 · {b.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={() => setStep('governance')}>
                  Back
                </Button>

                <Button variant="outline" onClick={downloadSummary}>
                  <Download className="h-4 w-4 mr-2" />
                  Download summary
                </Button>

                <Button onClick={submitAll} disabled={loading}>
                  {loading ? 'Saving…' : 'Submit'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'thanks' && (
          <Card>
            <CardHeader>
              <CardTitle>Thank you</CardTitle>
              <CardDescription>
                {consent === false
                  ? 'You selected “I disagree”. The questionnaire ends here.'
                  : 'Submission completed.'}
              </CardDescription>
            </CardHeader>
           <CardContent>
              <Button onClick={() => setStep('home')}>Start again</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}