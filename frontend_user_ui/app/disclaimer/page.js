import Link from 'next/link'

export const metadata = {
  title: 'Disclaimer – REDDYMATKA',
  description: 'Read the REDDYMATKA Disclaimer regarding accuracy of information, no professional advice, third-party links, and user responsibilities.',
}

export default function Disclaimer() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa] pb-10">
      {/* Header */}
      <header className="relative flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <Link href="/profile">
          <img src="/images/back-btn.png" alt="Back" className="h-5 w-5" />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">Disclaimer</h1>
        <div className="h-5 w-5" />
      </header>

      <main className="mx-auto w-full max-w-[430px] ">
        <article className="space-y-6 bg-white px-5 py-6 shadow-sm text-[#333]">

          {/* Warning banner */}
          <div className="border-l-4 border-[#c8960c] bg-[#fff9ee] px-4 py-3">
            <p className="text-sm font-semibold leading-relaxed text-[#7a5500]">
              REDDYMATKA is for informational and entertainment purposes only. We do not promote or support gambling in any form. Gambling may be illegal in your country or region. Please check and follow your local laws before accessing this site. REDDYMATKA is not responsible for any loss or damage arising from the use of this information.
            </p>
          </div>

          {/* Section 1 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">1. Accuracy of Information</h2>
            <p className="text-sm leading-relaxed">
              We make no representations or warranties about:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'The completeness, accuracy, reliability, suitability, or availability of any information, products, or services displayed on the Site;',
                'The timeliness or performance of the website or any linked pages.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Any reliance you place on such information is strictly at your own risk. We will not be liable for any errors, omissions, or inaccuracies in the content.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">2. No Legal, Financial, or Professional Advice</h2>
            <p className="text-sm leading-relaxed">
              The content on this website is intended solely for informational and educational purposes. Nothing on this Site should be interpreted as:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Legal advice,',
                'Financial guidance, or',
                'Professional consultation of any kind.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              You should always seek qualified advice from a licensed professional regarding your specific situation before making any decisions based on the information provided here.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">3. Third-Party Links</h2>
            <p className="text-sm leading-relaxed">
              This website may include hyperlinks or references to external websites. These links are provided solely for your convenience and do not imply:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Any endorsement of the content, services, or opinions contained within those sites; or',
                'Any responsibility for their availability, accuracy, or reliability.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Once you leave this website, we have no control over the content or privacy practices of external sites. We encourage you to review their respective privacy policies and terms of use before interacting with them.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">4. Personal Responsibility</h2>
            <p className="text-sm leading-relaxed">
              Your use of any information or materials on this website is entirely at your own discretion and risk. It is solely your responsibility to:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Verify the accuracy, relevance, and applicability of the information, and',
                'Ensure that any products, services, or content available through the Site meet your specific needs.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              We shall not be liable for any loss or damage — including but not limited to indirect, consequential, or incidental damages — arising from your use of the website or reliance on its content.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">5. No Warranties</h2>
            <p className="text-sm leading-relaxed">
              All materials and content on this website are provided &quot;as is&quot; and &quot;as available&quot; without any warranties of any kind, either express or implied. We do not warrant that:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'The website will always function without interruption, error, or delay;',
                'The content is free of viruses, malware, or harmful components; or',
                'Any defects will be corrected promptly.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Users are responsible for implementing appropriate security and data protection measures while accessing the Site.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">6. Consent</h2>
            <p className="text-sm leading-relaxed">
              By using this website, you acknowledge that you have read, understood, and agree to this Disclaimer and its terms. If you do not agree with any part of this Disclaimer, you should discontinue use of the Site immediately.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">7. Updates and Changes</h2>
            <p className="text-sm leading-relaxed">
              We reserve the right to modify, amend, or update this Disclaimer at any time without prior notice. Changes will take effect immediately upon posting. You are encouraged to review this page periodically to stay informed about any updates. Continued use of the Site following any changes constitutes acceptance of the revised Disclaimer.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">8. Contact Information</h2>
            <p className="text-sm leading-relaxed">
              If you have any questions, concerns, or comments about this Disclaimer, please contact us at:
            </p>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm">
                <span>📧</span>
                <a href="mailto:support@REDDYMATKA.com" className="font-semibold text-[#c8960c] underline underline-offset-2">
                  support@REDDYMATKA.com
                </a>
              </p>
              <p className="flex items-center gap-2 text-sm">
                <span>🌐</span>
                <span className="font-semibold text-[#c8960c]">https://www.REDDYMATKA.com</span>
              </p>
            </div>
          </section>

          {/* Section 9 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">9. Acknowledgment</h2>
            <p className="text-sm leading-relaxed">
              By continuing to use this website, you acknowledge that you have read, understood, and agree to comply with this Disclaimer and any applicable Terms and Conditions or Privacy Policy posted on this Site.
            </p>
          </section>

        </article>
      </main>
    </div>
  )
}
