import type { CheerioAPI } from 'cheerio'
import type { MessageAssetOptions, MessageSelection } from '../types'
import { escapeHtmlAttribute, getProxiedUrl } from '../url'
import { getImageLoading, inferImageDimensions, STYLE_URL_REGEX } from './utils'

export function getImages($: CheerioAPI, message: MessageSelection, options: MessageAssetOptions): string {
  const { staticProxy = '', id = '', index = 0, title = '' } = options
  const previewButtons: string[] = []
  const slides: string[] = []
  const loading = getImageLoading(index)
  const safeTitle = escapeHtmlAttribute(title || 'Image from post')
  const safePreviewLabel = escapeHtmlAttribute(title ? `Open image preview: ${title}` : 'Open image preview')
  const safeCloseLabel = 'Close image preview'

  for (const [photoIndex, photoNode] of message.find('.tgme_widget_message_photo_wrap').toArray().entries()) {
    const imageUrl = $(photoNode).attr('style')?.match(STYLE_URL_REGEX)?.[1]

    if (!imageUrl) {
      continue
    }

    const { width, height } = inferImageDimensions($, photoNode)
    const proxiedUrl = getProxiedUrl(staticProxy, imageUrl)

    previewButtons.push(
      `<button type="button" class="image-preview-button image-preview-wrap" data-lightbox="lightbox-${id}" data-index="${photoIndex}" aria-label="${safePreviewLabel}">`
      + `<img src="${proxiedUrl}" alt="${safeTitle}" width="${width}" height="${height}" loading="${loading}" />`
      + '</button>',
    )

    slides.push(
      '<div class="lightbox__slide">'
      + `<img class="modal-img" src="${proxiedUrl}" alt="${safeTitle}" width="${width}" height="${height}" loading="lazy" />`
      + '</div>',
    )
  }

  if (!previewButtons.length) {
    return ''
  }

  const lightboxId = `lightbox-${id}`
  const layoutClass = previewButtons.length > 1 ? 'image-list-multi' : 'image-list-single'
  const hasMultiple = previewButtons.length > 1

  const lightboxHtml = `<div class="modal lightbox" id="${lightboxId}" popover="auto" aria-label="Image preview">`
    + `<button type="button" class="modal__backdrop" aria-label="${safeCloseLabel}"></button>`
    + `<button type="button" class="modal__close" aria-label="${safeCloseLabel}">&times;</button>${
      hasMultiple
        ? `<div class="lightbox__counter"><span class="lightbox__counter-current">1</span> / <span class="lightbox__counter-total">${previewButtons.length}</span></div>`
        + '<button type="button" class="lightbox__prev" aria-label="Previous image">&lsaquo;</button>'
        + '<button type="button" class="lightbox__next" aria-label="Next image">&rsaquo;</button>'
        : ''
    }<div class="lightbox__viewport">`
    + `<div class="lightbox__track">${
      slides.join('')
    }</div>`
    + `</div>`
    + `</div>`

  return `<div class="image-list-container ${layoutClass}">${previewButtons.join('')}${lightboxHtml}</div>`
}
