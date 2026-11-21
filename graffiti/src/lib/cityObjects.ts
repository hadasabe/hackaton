import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { FeedStats, Graffiti, WalkBuilding, WalkPlace } from './types';

export type CityObjectKind = 'place' | 'building' | 'graffiti';

export interface CityObject {
  key: string;
  kind: CityObjectKind;
  id: string;
  name: string;
  category: string;
  address: string;
  description: string;
  image: string;
  lat: number | null;
  lng: number | null;
  era?: string;
  artType?: string;
  artist?: string;
  detailPath: string;
  place?: WalkPlace;
  building?: WalkBuilding;
  graffiti?: Graffiti;
}

export interface CityObjectsState {
  objects: CityObject[];
  places: CityObject[];
  graffiti: CityObject[];
  stats: FeedStats | null;
  loading: boolean;
  error: string;
}

function placeObject(place: WalkPlace): CityObject {
  return {
    key: `place-${place.id}`,
    kind: 'place',
    id: place.id,
    name: place.name,
    category: place.category,
    address: place.address,
    description: place.description,
    image: place.image,
    lat: place.lat,
    lng: place.lng,
    era: place.era,
    artType: place.artType,
    artist: place.artist,
    detailPath: `/object/${encodeURIComponent(place.slug || place.id)}`,
    place,
  };
}

function buildingObject(building: WalkBuilding): CityObject {
  const id = `building-${building.id}`;
  return {
    key: id,
    kind: 'building',
    id,
    name: building.title,
    category: building.category || 'Здание',
    address: building.address,
    description: building.description,
    image: building.image_path,
    lat: building.lat,
    lng: building.lng,
    era: 'Добавлено горожанами',
    detailPath: `/object/${encodeURIComponent(id)}`,
    building,
  };
}

function graffitiObject(item: Graffiti): CityObject {
  return {
    key: `graffiti-${item.id}`,
    kind: 'graffiti',
    id: String(item.id),
    name: item.address || 'Граффити',
    category: 'Стрит-арт',
    address: item.address,
    description: item.description,
    image: item.image_path,
    lat: item.lat ?? null,
    lng: item.lng ?? null,
    artist: item.author_name,
    detailPath: `/g/${item.id}`,
    graffiti: item,
  };
}

const ADDRESS_STOP_WORDS = new Set([
  'улица', 'улицы', 'ул', 'проспект', 'пр', 'переулок', 'пер',
  'набережная', 'наб', 'площадь', 'пл', 'бульвар', 'шоссе', 'проезд',
  'район', 'дом', 'д', 'здание', 'здания', 'фасад', 'торец', 'торцевой',
  'внутренний', 'двор', 'дворе', 'у', 'в', 'на', 'со', 'стороны',
  'центра', 'культуры', 'правительства', 'стена', 'храма',
  'петра', 'им', 'имени',
]);

function addressKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .split(' ')
    .filter((token) => token && !ADDRESS_STOP_WORDS.has(token))
    .join(' ');
}

function sameAddress(one: string, two: string): boolean {
  const a = addressKey(one);
  const b = addressKey(two);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!/[0-9]/.test(a) || !/[0-9]/.test(b)) return false;
  return a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

function interleave(places: CityObject[], graffiti: CityObject[]): CityObject[] {
  const result: CityObject[] = [];
  const length = Math.max(places.length, graffiti.length);
  for (let index = 0; index < length; index += 1) {
    if (places[index]) result.push(places[index]);
    if (graffiti[index]) result.push(graffiti[index]);
  }
  return result;
}

export async function loadCityObjects(): Promise<CityObjectsState> {
  const [feedResult, placesResult, buildingsResult] = await Promise.allSettled([
    api.feed(),
    api.walkPlaces(),
    api.walkBuildings(),
  ]);

  const placeObjects: CityObject[] = [];
  const graffitiObjects: CityObject[] = [];
  let stats: FeedStats | null = null;
  let error = '';

  if (placesResult.status === 'fulfilled') {
    placeObjects.push(...placesResult.value.items.map(placeObject));
  } else {
    error = 'Не удалось загрузить места';
  }

  if (buildingsResult.status === 'fulfilled') {
    placeObjects.push(...buildingsResult.value.items.map(buildingObject));
  }

  if (feedResult.status === 'fulfilled') {
    stats = feedResult.value.stats;
    graffitiObjects.push(...feedResult.value.items.map(graffitiObject));
  } else {
    error = error || 'Не удалось загрузить граффити';
  }

  const artPlaceAddresses = placeObjects
    .filter((object) => object.place && object.category === 'Стрит-арт')
    .map((object) => object.address);

  const uniqueGraffiti = graffitiObjects.filter((object) => (
    !artPlaceAddresses.some((placeAddress) => sameAddress(object.address, placeAddress))
  ));

  return {
    objects: interleave(placeObjects, uniqueGraffiti),
    places: placeObjects,
    graffiti: uniqueGraffiti,
    stats,
    loading: false,
    error,
  };
}

export function useCityObjects() {
  const [state, setState] = useState<CityObjectsState>({
    objects: [],
    places: [],
    graffiti: [],
    stats: null,
    loading: true,
    error: '',
  });

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    setState(await loadCityObjects());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updatePlace = useCallback((id: string, patch: Partial<WalkPlace>) => {
    setState((current) => {
      const places = current.places.map((object) => (
        object.id === id ? { ...object, place: object.place ? { ...object.place, ...patch } : object.place } : object
      ));
      const objects = current.objects.map((object) => (
        object.id === id ? { ...object, place: object.place ? { ...object.place, ...patch } : object.place } : object
      ));
      return { ...current, places, objects };
    });
  }, []);

  const updateGraffiti = useCallback((id: number, patch: Partial<Graffiti>) => {
    setState((current) => {
      const graffiti = current.graffiti.map((object) => (
        object.graffiti?.id === id
          ? { ...object, graffiti: { ...object.graffiti, ...patch } }
          : object
      ));
      const objects = current.objects.map((object) => (
        object.graffiti?.id === id
          ? { ...object, graffiti: { ...object.graffiti, ...patch } }
          : object
      ));
      return { ...current, graffiti, objects };
    });
  }, []);

  return { ...state, reload, updatePlace, updateGraffiti };
}
