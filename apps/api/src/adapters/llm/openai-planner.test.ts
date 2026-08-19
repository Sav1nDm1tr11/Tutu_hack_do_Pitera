import { describe, expect, it } from 'vitest';
import { extractJsonObject } from './openai-planner';

describe('extractJsonObject', () => {
  it('разбирает чистый объект', () => {
    expect(extractJsonObject('{"headline":"ok"}')).toEqual({ headline: 'ok' });
  });

  it('снимает markdown-ограждение, которым часто отвечают бесплатные модели', () => {
    expect(extractJsonObject('```json\n{"includeHotels":true}\n```')).toEqual({
      includeHotels: true,
    });
  });

  it('находит объект внутри поясняющего текста', () => {
    expect(extractJsonObject('Конечно:\n{"transportModes":["train"]}\nГотово.')).toEqual({
      transportModes: ['train'],
    });
  });

  it('отказывается, если JSON нет', () => {
    expect(() => extractJsonObject('нет объекта')).toThrow(/нет JSON/u);
  });
});
