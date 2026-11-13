export class ForecastError extends Error {
  constructor(code, status = null) {
    super(code);
    this.name = "ForecastError";
    this.code = code;
    this.status = status;
  }
}

// Do not expose request URLs (which contain location coordinates) or provider bodies.
export function failureMessage(error) {
  if (error?.code === "http") {
    if (error.status === 429)
      return "조회 한도를 초과했습니다 (HTTP 429). 잠시 후 다시 시도해 주세요.";
    if (error.status >= 500)
      return `날씨 제공 서버가 오류를 반환했습니다 (HTTP ${error.status}). 잠시 후 다시 시도해 주세요.`;
    return `날씨 서버가 요청을 거부했습니다 (HTTP ${error.status}). 다른 지역도 같은지 확인해 주세요.`;
  }
  if (error?.name === "AbortError" || error?.name === "TimeoutError")
    return "날씨 요청 시간이 초과됐습니다. 연결을 확인하고 다시 조회해 주세요.";
  if (error?.code === "format" || error instanceof SyntaxError)
    return "날씨 응답 형식이 예상과 다릅니다. 다시 조회해도 같다면 페이지 점검이 필요합니다.";
  if (error?.code === "no_data")
    return "현재 시각에 사용할 예보 자료가 없습니다. 기기의 날짜·시간 설정을 확인하고 다시 조회해 주세요.";
  if (error instanceof TypeError)
    return "날씨 API에 연결하지 못했습니다. 네트워크 또는 브라우저의 접속 차단 여부를 확인해 주세요.";
  return "오류 원인을 확인하지 못했습니다. 다시 조회해 주세요.";
}

export function summarizeFailures(errors) {
  return [...new Set(errors.map(failureMessage))].join(" ");
}
