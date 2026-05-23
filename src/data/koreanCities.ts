export interface KoreanCity {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export const koreanCities: KoreanCity[] = [
  { id: 'seoul', label: '서울', latitude: 37.5665, longitude: 126.9780 },
  { id: 'busan', label: '부산', latitude: 35.1796, longitude: 129.0756 },
  { id: 'daegu', label: '대구', latitude: 35.8714, longitude: 128.6014 },
  { id: 'incheon', label: '인천', latitude: 37.4563, longitude: 126.7052 },
  { id: 'gwangju', label: '광주', latitude: 35.1595, longitude: 126.8526 },
  { id: 'daejeon', label: '대전', latitude: 36.3504, longitude: 127.3845 },
  { id: 'ulsan', label: '울산', latitude: 35.5384, longitude: 129.3114 },
  { id: 'sejong', label: '세종', latitude: 36.4800, longitude: 127.2890 },
  { id: 'suwon', label: '수원', latitude: 37.2636, longitude: 127.0286 },
  { id: 'seongnam', label: '성남', latitude: 37.4200, longitude: 127.1265 },
  { id: 'goyang', label: '고양', latitude: 37.6584, longitude: 126.8320 },
  { id: 'yongin', label: '용인', latitude: 37.2411, longitude: 127.1776 },
  { id: 'cheongju', label: '청주', latitude: 36.6424, longitude: 127.4890 },
  { id: 'cheonan', label: '천안', latitude: 36.8151, longitude: 127.1139 },
  { id: 'jeonju', label: '전주', latitude: 35.8242, longitude: 127.1480 },
  { id: 'changwon', label: '창원', latitude: 35.2280, longitude: 128.6811 },
  { id: 'pohang', label: '포항', latitude: 36.0190, longitude: 129.3435 },
  { id: 'jeju', label: '제주', latitude: 33.4996, longitude: 126.5312 },
];

export const defaultKoreanCity = koreanCities[0];

export function getKoreanCity(cityId: string) {
  return koreanCities.find((city) => city.id === cityId) ?? defaultKoreanCity;
}
