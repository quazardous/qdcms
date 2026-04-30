import { inject } from 'vue'
import { CMS_INJECTION, type Cms } from '../cms/createCms'

export function useCms(): Cms {
  const cms = inject(CMS_INJECTION)
  if (!cms) {
    throw new Error('[qdcms] useCms() called without a Cms instance — did you forget cms.install(app)?')
  }
  return cms
}
