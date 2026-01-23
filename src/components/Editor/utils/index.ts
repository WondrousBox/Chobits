/**
 * 从 element 上提取 dataset 数据
 * @param element
 * @param attribute
 * @param transformToJSON 是否要转为 JSON
 */
export const getDatasetAttribute = (attribute: string, transformToJSON = false) => {
  return (element: HTMLElement) => {
    const dataKey = attribute.startsWith('data-') ? attribute : `data-${attribute}`;
    let value = decodeURIComponent(element.getAttribute(dataKey)!);

    if (value == null || (typeof value === 'string' && value === 'null')) {
      try {
        const html = element.outerHTML;
        // eslint-disable-next-line no-useless-escape
        const texts = html.match(/(.|\s)+?\="(.|\s)+?"/gi);
        if (texts && texts.length) {
          const params = texts
            .map((str) => str.trim())
            .reduce((accu, item) => {
              const i = item.indexOf('=');
              const arr = [item.slice(0, i), item.slice(i + 1).slice(1, -1)];
              // @ts-ignore
              accu[arr[0]] = arr[1];
              return accu;
            }, {});

          // @ts-ignore
          value = (params[attribute.toLowerCase()] || '').replaceAll('&quot;', '"');
        }
      } catch (e: any) {
        console.error('解析 element 失败！', e.message, element);
      }
    }

    if (transformToJSON) {
      try {
        return JSON.parse(value);
      } catch (e) {
        return {};
      }
    }

    if (value.includes('%') || value.includes('auto')) {
      return value;
    }

    const toNumber = parseInt(value);
    return toNumber !== toNumber ? value : toNumber; // 避免 NaN
  };
};
