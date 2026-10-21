import useSWRV from 'swrv'
import { useSWRVConfig } from './swrvConfig'

export interface LauncherNews {
  category: string
  image: {
    url: string
    width: number
    height: number
  }
  date: string
  title: string
  description: string
  link: string
}

export function useLauncherNews() {
  const { data, error, isValidating, mutate } = useSWRV('/launcher-news', async (): Promise<LauncherNews[]> => [], useSWRVConfig())
  const news = computed(() => data.value || [] as LauncherNews[])
  return {
    news,
    isValidating,
    mutate,
    error,
  }
}
