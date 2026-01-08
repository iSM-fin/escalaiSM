import { LocationData, WeekDate, FinancialRule } from './types';

export const WEEK_DAYS: WeekDate[] = [
  { dayName: 'Segunda-Feira', date: '05/01/2026', dateKey: '2026-01-05', isOutOfMonth: false },
  { dayName: 'Terça-Feira', date: '06/01/2026', dateKey: '2026-01-06', isOutOfMonth: false },
  { dayName: 'Quarta-Feira', date: '07/01/2026', dateKey: '2026-01-07', isOutOfMonth: false },
  { dayName: 'Quinta-Feira', date: '08/01/2026', dateKey: '2026-01-08', isOutOfMonth: false },
  { dayName: 'Sexta-Feira', date: '09/01/2026', dateKey: '2026-01-09', isOutOfMonth: false },
  { dayName: 'Sábado', date: '10/01/2026', dateKey: '2026-01-10', isOutOfMonth: false },
  { dayName: 'Domingo', date: '11/01/2026', dateKey: '2026-01-11', isOutOfMonth: false },
];

export const SHIFT_HOURS_CONFIG = {
  "manhã": 6,
  "tarde": 6,
  "diurno": 12,
  "noturno": 12,
  "24h": 24,
  "noturno c/ acionamento": 12,
  "24h c/ acionamento": 24,
  "domingo 24h": 24
};

export const SHIFT_DISPLAY_TIMES: Record<string, string> = {
  "manhã": "07-13h",
  "tarde": "13-19h",
  "diurno": "07-19h",
  "noturno": "19-07h",
  "24h": "07-07h",
  "noturno c/ acionamento": "19-07h",
  "24h c/ acionamento": "07-07h",
  "domingo 24h": "07-07h",
  "manhã sábado - salto": "07-13h",
  "diurno c/ acionamento": "07-19h"
};

export const SHIFT_TIMES_CONFIG = {
  "manhã": ["07:00", "13:00", "", "", "06 horas"],
  "tarde": ["", "", "13:00", "19:00", "06 horas"],
  "diurno": ["07:00", "19:00", "", "", "12 horas"],
  "noturno": ["19:00", "07:00", "", "", "12 horas"],
  "24h": ["07:00", "07:00", "", "", "24 horas"],
  "noturno c/ acionamento": ["19:00", "07:00", "", "", "12 horas"],
  "24h c/ acionamento": ["07:00", "07:00", "", "", "24 horas"],
  "domingo 24h": ["07:00", "07:00", "", "", "24 horas"],
  "manhã sábado - salto": ["07:00", "13:00", "", "", "06 horas"],
  "diurno c/ acionamento": ["", "", "13:00", "19:00", "06 horas"]
};

// Helper to generate default rules from raw data
const generateDefaultRules = (): FinancialRule[] => {
  const rawData = [
    ["Porto Feliz", "Manhã", 950, false],
    ["Porto Feliz", "Tarde", 950, false],
    ["Porto Feliz", "Diurno", 1900, false],
    ["Porto Feliz", "Noturno", 1900, false],
    ["Porto Feliz", "24h", 3800, false],
    ["Porto Feliz", "Manhã", 1000, true],
    ["Porto Feliz", "Tarde", 1000, true],
    ["Porto Feliz", "Diurno", 2000, true],
    ["Porto Feliz", "Noturno", 2000, true],
    ["Porto Feliz", "24h", 4000, true],

    ["Votorantim", "Manhã", 950, false],
    ["Votorantim", "Tarde", 950, false],
    ["Votorantim", "Diurno", 1900, false],
    ["Votorantim", "Noturno", 700, false],
    ["Votorantim", "24h", 2600, false],
    ["Votorantim", "Noturno c/ Acionamento", 1300, false],
    ["Votorantim", "24h c/ Acionamento", 3200, false],
    ["Votorantim", "Domingo 24h", 2000, false],
    ["Votorantim", "Diurno c/ Acionamento", 1000, false],
    ["Votorantim", "Sobreaviso Diurno", 500, false],
    ["Votorantim", "Manhã", 1000, true],
    ["Votorantim", "Tarde", 1000, true],
    ["Votorantim", "Diurno", 2000, true],
    ["Votorantim", "24h", 2700, true],
    ["Votorantim", "Noturno", 700, true],
    ["Votorantim", "Noturno c/ Acionamento", 1300, true],
    ["Votorantim", "24h c/ Acionamento", 3300, true],
    ["Votorantim", "Domingo 24h", 2000, true],
    ["Votorantim", "Diurno c/ Acionamento", 1000, true],
    ["Votorantim", "Sobreaviso Diurno", 500, true],

    ["Boituva", "Manhã", 950, false],
    ["Boituva", "Tarde", 950, false],
    ["Boituva", "Diurno", 1900, false],
    ["Boituva", "Noturno", 1800, false],
    ["Boituva", "24h", 3700, false],
    ["Boituva", "Manhã", 1000, true],
    ["Boituva", "Tarde", 1000, true],
    ["Boituva", "Diurno", 2000, true],
    ["Boituva", "Noturno", 2000, true],
    ["Boituva", "24h", 4000, true],

    ["Salto", "Manhã", 1300, false],
    ["Salto", "Tarde", 1300, false],
    ["Salto", "Diurno", 2600, false],
    ["Salto", "Manhã Sábado - Salto", 2300, false],
    ["Salto", "Manhã", 1300, true],
    ["Salto", "Tarde", 1300, true],
    ["Salto", "Diurno", 2600, true],
    ["Salto", "Manhã Sábado - Salto", 2300, true],

    ["Santa Lucinda", "Manhã", 1000, false],
    ["Santa Lucinda", "Tarde", 1000, false],
    ["Santa Lucinda", "Diurno", 2000, false],
    ["Santa Lucinda", "Manhã", 1000, true],
    ["Santa Lucinda", "Tarde", 1000, true],
    ["Santa Lucinda", "Diurno", 2000, true],

    ["Ame", "Tarde", 1000, false],
    ["Ame", "Manhã", 1000, false],
    ["Ame", "Diurno", 2000, false],
    ["Ame", "Tarde", 1000, true],
    ["Ame", "Manhã", 1000, true],

    ["Registro", "Manhã", 1200, false],
    ["Registro", "Tarde", 1200, false],
    ["Registro", "Diurno", 2000, false],
    ["Registro", "Noturno", 1000, false],
    ["Registro", "24h", 3000, false],
    ["Registro", "Domingo 24h", 2000, false],
    ["Registro", "Manhã", 1200, true],
    ["Registro", "Tarde", 1200, true],
    ["Registro", "Diurno", 2000, true],
    ["Registro", "Noturno", 1000, true],
    ["Registro", "24h", 3000, true],
    ["Registro", "Domingo 24h", 2000, true],
  ];

  return rawData.map((rule, index) => ({
    id: `rule-default-${index}`,
    hospitalName: rule[0] as string,
    shiftName: rule[1] as string,
    value: rule[2] as number,
    isDif: rule[3] as boolean
  }));
};

export const DEFAULT_FINANCIAL_RULES = generateDefaultRules();

export const SCHEDULE_DATA: LocationData[] = [
  {
    id: 'porto-feliz',
    name: 'Porto Feliz',
    theme: 'green',
    shifts: [
      {
        id: 'pf-diurno',
        name: 'Diurno',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Marcos André', time: '07-19h' }] },
          { dayIndex: 1, assignments: [{ name: 'Ricardo Cristóvão', time: '07-19h' }] },
          { dayIndex: 2, assignments: [{ name: 'Pedro Maich', time: '07-19h' }] },
          { dayIndex: 3, assignments: [{ name: 'Mariana Inácio', time: '07-19h' }] },
          { dayIndex: 4, assignments: [{ name: 'Mariana Inácio', time: '07-19h' }] },
          { dayIndex: 5, assignments: [{ name: 'Rafael Camerlengo', time: '07-19h' }] },
          { dayIndex: 6, assignments: [{ name: 'Rafael Camerlengo', time: '07-19h' }] },
        ],
      },
      {
        id: 'pf-extra-1',
        name: 'Anestesista Extra',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Thiago Dalleprane', time: '07-19h' }] },
          { dayIndex: 1, assignments: [{ name: 'Marcos André', time: '07-19h' }] },
          { dayIndex: 2, assignments: [{ name: 'Marco Antonio e Cia', time: '07-19h' }] },
          { dayIndex: 3, assignments: [{ name: 'Iuri Soares', time: '07-19h' }] },
          { dayIndex: 4, assignments: [{ name: 'Leonardo Martins', time: '07-19h' }] },
        ],
      },
      {
        id: 'pf-extra-2',
        name: 'Anestesista Extra',
        schedule: [
          { dayIndex: 1, assignments: [{ name: 'Iuri Soares', time: '13-19h' }] },
        ],
      },
      {
        id: 'pf-extra-3',
        name: 'Anestesista Extra',
        schedule: [],
      },
      {
        id: 'pf-noturno',
        name: 'Noturno',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Marcos André', time: '19-07h' }] },
          { dayIndex: 1, assignments: [{ name: 'Ricardo Cristóvão', time: '19-07h' }] },
          { dayIndex: 2, assignments: [{ name: 'Pedro Maich', time: '19-07h' }] },
          { dayIndex: 3, assignments: [{ name: 'Mariana Inácio', time: '19-07h' }] },
          { dayIndex: 4, assignments: [{ name: 'Marcos André', time: '19-07h' }] },
          { dayIndex: 5, assignments: [{ name: 'Rafael Camerlengo', time: '19-07h' }] },
          { dayIndex: 6, assignments: [{ name: 'Getúlio André', time: '19-07h', isBold: true, isRed: true }] },
        ],
      },
    ],
  },
  {
    id: 'boituva',
    name: 'Boituva',
    theme: 'purple',
    shifts: [
      {
        id: 'bt-diurno',
        name: 'Diurno',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Hernando Mauro', time: '07-19h' }] },
          { dayIndex: 1, assignments: [{ name: 'Katiusa de Abreu', time: '07-19h' }] },
          { dayIndex: 2, assignments: [{ name: 'Katiusa de Abreu', time: '07-19h' }] },
          { dayIndex: 3, assignments: [{ name: 'Ellen Cristine', time: '07-19h' }] },
          { dayIndex: 4, assignments: [{ name: 'Marcos André', time: '07-19h' }] },
          { dayIndex: 5, assignments: [{ name: 'Ana Beatriz', subName: 'Camerlengo', time: '07-19h' }] },
          { dayIndex: 6, assignments: [{ name: 'Anne Karoline', subName: 'Mendes', time: '07-19h' }] },
        ],
      },
      {
        id: 'bt-noturno',
        name: 'Noturno',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Henrique da Silva', time: '19-07h' }] },
          { dayIndex: 1, assignments: [{ name: 'Katiusa de Abreu', time: '19-07h' }] },
          { dayIndex: 2, assignments: [{ name: 'Henrique da Silva', time: '19-07h' }] },
          { dayIndex: 3, assignments: [{ name: 'Ellen Cristine', time: '19-07h' }] },
          { dayIndex: 4, assignments: [{ name: 'Ana Beatriz', subName: 'Camerlengo', time: '19-07h' }] },
          { dayIndex: 5, assignments: [{ name: 'Ana Beatriz', subName: 'Camerlengo', time: '19-07h' }] },
          { dayIndex: 6, assignments: [{ name: 'Anne Karoline', subName: 'Mendes', time: '19-07h' }] },
        ],
      },
    ],
  },
  {
    id: 'votorantim',
    name: 'Votorantim',
    theme: 'slate',
    shifts: [
      {
        id: 'vt-diurno',
        name: 'Diurno',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Leonardo Martins', time: '07-19h' }] },
          { dayIndex: 1, assignments: [{ name: 'Andrea Cardoso', time: '07-13h' }] },
          { dayIndex: 2, assignments: [{ name: 'Thiago Dalleprane', time: '07-19h' }] },
          { dayIndex: 3, assignments: [{ name: 'Andrea Cardoso', time: '07-19h' }] },
          { dayIndex: 4, assignments: [{ name: 'Andrea Cardoso', time: '07-13h' }] },
          { dayIndex: 5, assignments: [{ name: 'Thiago Dalleprane', time: '07-19h' }] },
          { dayIndex: 6, assignments: [{ name: 'Thiago Dalleprane', time: '07-19h' }] },
        ],
      },
      {
        id: 'vt-2nd',
        name: '2 Anestesista',
        schedule: [
          { dayIndex: 1, assignments: [{ name: 'Thiago Dalleprane', time: '13-19h' }] },
          { dayIndex: 4, assignments: [{ name: 'Thays Donaire', time: '13-19h' }] },
        ],
      },
      {
        id: 'vt-noturno',
        name: 'Noturno',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Leonardo Martins', time: '19-07h' }] },
          { dayIndex: 1, assignments: [{ name: 'Thiago Dalleprane', time: '19-07h' }] },
          { dayIndex: 2, assignments: [{ name: 'Thiago Dalleprane', time: '19-07h' }] },
          { dayIndex: 3, assignments: [{ name: 'Andrea Cardoso', time: '19-07h' }] },
          { dayIndex: 4, assignments: [{ name: 'Thiago Dalleprane', time: '19-07h' }] },
          { dayIndex: 5, assignments: [{ name: 'Thiago Dalleprane', time: '19-07h' }] },
          { dayIndex: 6, assignments: [{ name: 'Thiago Dalleprane', time: '19-07h' }] },
        ],
      },
    ],
  },
  {
    id: 'santa-lucinda',
    name: 'Santa Lucinda',
    theme: 'blue',
    shifts: [
      {
        id: 'sl-manha',
        name: 'Manhã',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Thays Donaire', time: '7-19h' }] },
          { dayIndex: 1, assignments: [{ name: 'Leonardo Martins', time: '7-19h' }] },
          { dayIndex: 2, assignments: [{ name: 'Andrea Cardoso', time: '7-19h' }] },
          { dayIndex: 3, assignments: [{ name: 'Leonardo Martins', time: '7-19h' }] },
          { dayIndex: 4, assignments: [{ name: 'Thiago Dalleprane', time: '7-19h' }] },
        ],
      },
      {
        id: 'sl-tarde',
        name: 'Tarde',
        schedule: [
          { dayIndex: 4, assignments: [{ name: 'Andrea Cardoso', time: '14-19h' }] },
        ],
      },
      {
        id: 'sl-ambulatorio',
        name: 'Ambulatório',
        schedule: [],
      }
    ],
  },
  {
    id: 'salto',
    name: 'Salto',
    theme: 'orange',
    shifts: [
      {
        id: 'sa-manha',
        name: 'Manhã',
        schedule: [
          { dayIndex: 1, assignments: [{ name: 'Thiago Dalleprane', time: '07-13h' }] },
          { dayIndex: 2, assignments: [{ name: 'Leonardo Martins', time: '07-13h' }] },
          { dayIndex: 3, assignments: [{ name: 'Thiago Dalleprane', time: '07-13h' }] },
          { dayIndex: 5, assignments: [{ name: 'Leonardo Martins', time: '07-19h' }] },
        ],
      },
      {
        id: 'sa-tarde',
        name: 'Tarde',
        schedule: [
          { dayIndex: 3, assignments: [{ name: 'Thays Donaire', time: '13-19h' }] },
        ],
      }
    ],
  },
  {
    id: 'ame',
    name: 'Ame',
    theme: 'pink',
    shifts: [
      {
        id: 'ame-manha',
        name: 'Manhã',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Iuri Soares', time: '7-13h' }] },
          { dayIndex: 3, assignments: [{ name: 'Juliana Bevilacqua', time: '7-13h' }] },
          { dayIndex: 4, assignments: [{ name: 'Lucas Dohler', time: '7-13h' }] },
        ],
      },
      {
        id: 'ame-tarde',
        name: 'Tarde',
        schedule: [
          { dayIndex: 1, assignments: [{ name: 'Lucas Dohler', time: '13-19h' }] },
        ],
      }
    ],
  },
  {
    id: 'medvitalis',
    name: 'Medvitalis',
    theme: 'indigo',
    shifts: [
      {
        id: 'mv-manha',
        name: 'Manhã',
        schedule: [
          { dayIndex: 2, assignments: [{ name: 'Iuri Soares', time: '07:30h' }] },
        ],
      },
      {
        id: 'mv-tarde',
        name: 'Tarde',
        schedule: [],
      }
    ],
  },
  {
    id: 'fenix',
    name: 'Fênix',
    theme: 'sky',
    shifts: [
      { id: 'fx-manha', name: 'Manhã', schedule: [] },
      { id: 'fx-tarde', name: 'Tarde', schedule: [] },
    ],
  },
  {
    id: 'top-imagens',
    name: 'TOP Imagens',
    theme: 'yellow',
    shifts: [
      { id: 'ti-manha', name: 'Manhã', schedule: [] },
      { id: 'ti-tarde', name: 'Tarde', schedule: [] },
    ],
  },
  {
    id: 'particular',
    name: 'Particular',
    theme: 'neutral',
    shifts: [
      { id: 'pt-manha', name: 'Manhã', schedule: [] },
      { id: 'pt-tarde', name: 'Tarde', schedule: [] },
    ],
  },
  {
    id: 'agenda-iuri',
    name: 'Agenda Dr Iuri',
    theme: 'emerald',
    shifts: [
      {
        id: 'ai-manha',
        name: 'Manhã',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Ame', time: '7-13h' }] },
          { dayIndex: 2, assignments: [{ name: 'Medvitalis 4 faco' }] },
          { dayIndex: 3, assignments: [{ name: 'Porto Feliz', time: '7-19h' }] },
        ],
      },
      {
        id: 'ai-tarde',
        name: 'Tarde',
        schedule: [
          { dayIndex: 0, assignments: [{ name: 'Itu', time: '13-19h' }] },
          { dayIndex: 1, assignments: [{ name: 'Porto Feliz', time: '13-19h' }] },
        ],
      },
    ],
  },
];