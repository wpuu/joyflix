/**
 * Distinguish reliable native Safari HLS from an Android engine which merely
 * advertises a canPlayType() hint. That hint is NOT evidence of first-frame playback.
 */
export function preferNativeHls(nativeAvailable: boolean, mseAvailable: boolean,
  managedMediaSource: boolean): boolean {
  return nativeAvailable && (managedMediaSource || !mseAvailable);
}
export function hlsErrorLabel(type: unknown): string {
  if (type === "networkError") return "HLS_NET：播放清单或分片加载失败（可能是跨域、网络、地址失效或权限限制）";
  if (type === "mediaError") return "HLS_MEDIA：视频解码失败（可能是编码格式或媒体数据不兼容）";
  return "HLS_OTHER：视频线路异常，尚无法确定具体原因";
}
export function mediaErrorLabel(code: number | undefined): string {
  if (code === 2) return "VIDEO_NET：视频网络读取失败";
  if (code === 3) return "VIDEO_DECODE：视频解码失败";
  if (code === 4) return "VIDEO_FORMAT：当前浏览器不支持该视频，或地址未返回有效视频";
  return "VIDEO_UNKNOWN：浏览器报告视频加载异常";
}

/** Only bounded error categories; never return signed media URLs or raw messages. */
export function hlsFailureLabel(data: unknown): string {
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  const details = typeof row.details === "string" ? row.details : "";
  const response = row.response && typeof row.response === "object" &&
    !Array.isArray(row.response) ? row.response as Record<string, unknown> : {};
  const http = typeof response.code === "number" && Number.isSafeInteger(response.code) &&
    response.code >= 400 && response.code <= 599 ? response.code : null;
  let stage = "NETWORK", label = "视频资源";
  if (/^manifest/i.test(details)) { stage = "MANIFEST"; label = "主播放清单"; }
  else if (/^level|^audioTrack|^subtitleTrack|^subtitleLoad/i.test(details)) {
    stage = "LEVEL"; label = "子清单或音轨";
  } else if (/^frag|^part/i.test(details)) {
    stage = "SEGMENT"; label = "视频分片";
  } else if (/^key/i.test(details)) { stage = "KEY"; label = "密钥请求"; }
  if (http !== null) {
    return "HLS_" + stage + "_HTTP_" + http + "：" + label +
      "请求返回 HTTP " + http + "，这条资源暂时无法加载。";
  }
  if (/TimeOut|Timeout|timeOut/i.test(details)) {
    return "HLS_" + stage + "_TIMEOUT：" + label + "请求超时，原因尚未确认。";
  }
  if (/Parsing|Invalid|Incompatible/i.test(details)) {
    return "HLS_" + stage + "_PARSE：" + label + "数据或编码无法按 HLS 格式处理。";
  }
  if (row.type === "mediaError") {
    return "HLS_MEDIA：媒体解码失败，可能是编码或浏览器兼容问题。";
  }
  if (row.type === "networkError") {
    return "HLS_" + stage + "_NETWORK：" + label +
      "加载失败，可能是跨域、网络或源站策略，尚无法确定。";
  }
  return hlsErrorLabel(row.type);
}
export function playbackFailureCode(reason: unknown): string {
  if (typeof reason !== "string") return "PLAYER_UNKNOWN";
  return /^((?:HLS|VIDEO)_[A-Z0-9_]{2,45})：/.exec(reason)?.[1] ??
    "PLAYER_UNCONFIRMED";
}
