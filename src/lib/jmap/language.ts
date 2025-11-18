import { APIGatewayProxyEventV2 } from "aws-lambda"
import acceptLanguage from "accept-language"

// TODO support more languages
export const supportedLanguages = ["en"] as const

export type SupportedLanguage = (typeof supportedLanguages)[number]

export const defaultLanguage: SupportedLanguage = "en"

acceptLanguage.languages([...supportedLanguages])

export function selectLanguage(event: APIGatewayProxyEventV2): SupportedLanguage {
  const acceptLanguageHeader = event.headers["accept-language"] || event.headers["Accept-Language"]

  if (!acceptLanguageHeader) {
    return defaultLanguage
  }

  const matchedLanguage = acceptLanguage.get(acceptLanguageHeader)

  return (matchedLanguage || defaultLanguage) as SupportedLanguage
}
