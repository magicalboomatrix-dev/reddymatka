import Link from 'next/link'

export const metadata = {
  title: 'Terms and Conditions – REDDYMATKA',
  description: 'Read the Terms and Conditions for using REDDYMATKA.com.',
}

export default function TermsAndConditions() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa] pb-10">
      {/* Header */}
      <header className="relative flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <Link href="/profile">
          <img src="/images/back-btn.png" alt="Back" className="h-5 w-5" />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">Terms and Conditions</h1>
        <div className="h-5 w-5" />
      </header>

      <main className="mx-auto w-full max-w-[430px] ">
        <article className="space-y-6 bg-white px-5 py-6 shadow-sm text-[#333]">

          {/* Section 1 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">1. Acceptance of Terms</h2>
            <p className="text-sm leading-relaxed">
              By using this Site, you confirm that you are at least 18 years old and have the legal capacity to enter into this agreement.
            </p>
            <p className="text-sm leading-relaxed">
              If you do not agree with these Terms or any part thereof, you must discontinue use of the Site immediately.
            </p>
            <p className="text-sm leading-relaxed">
              Access to and use of the Site are conditional upon your full acceptance and compliance with these Terms and any applicable laws or regulations.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">2. Modification of Terms</h2>
            <p className="text-sm leading-relaxed">
              We reserve the right to modify, update, or replace these Terms at any time without prior notice. Changes will take effect immediately upon posting. By continuing to use the Site after revisions are published, you accept and agree to the updated Terms. We recommend checking this page regularly to stay informed of any modifications.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">3. Eligibility and User Responsibilities</h2>
            <p className="text-sm leading-relaxed">
              You agree to use the Site for lawful purposes only and in compliance with all applicable laws, regulations, and guidelines. You must not:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Attempt to gain unauthorized access to any system, server, or network connected to the Site;',
                'Engage in any activity that may interfere with the performance or security of the Site;',
                'Post, upload, or transmit any material that is illegal, offensive, defamatory, or violates any third-party rights;',
                'Use automated scripts, bots, or data-scraping tools to collect information from the Site;',
                'Impersonate any person or entity, or misrepresent your affiliation with any organization;',
                'Use the Site for any form of unlawful gambling, money laundering, or fraudulent activity.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              We reserve the right to suspend or terminate access to users who violate these Terms.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">4. Intellectual Property Rights</h2>
            <p className="text-sm leading-relaxed">
              All materials, including text, graphics, images, logos, designs, and software available on the Site, are protected by copyright, trademark, and other intellectual property laws. All rights are reserved by the Site owner unless otherwise stated. You may not:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Copy, modify, or reproduce any content without prior written consent;',
                'Use trademarks, trade names, or logos appearing on the Site without authorization;',
                'Redistribute or sell any material derived from the Site for commercial purposes.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Limited permission is granted to view and download content for personal, non-commercial use only.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">5. Privacy and Data Protection</h2>
            <p className="text-sm leading-relaxed">
              Your use of the Site is governed by our{' '}
              <Link href="/privacy-policy" className="font-semibold text-[#c8960c] underline underline-offset-2">
                Privacy Policy
              </Link>
              , which outlines how we collect, use, and protect your personal information. We are committed to safeguarding your privacy and ensuring compliance with applicable data protection laws. By using the Site, you consent to the data practices described in the Privacy Policy.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">6. Third-Party Websites and Services</h2>
            <p className="text-sm leading-relaxed">
              The Site may contain links to external websites operated by third parties. These links are provided for informational and convenience purposes only. We do not endorse, control, or assume responsibility for:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'The accuracy or content of third-party sites;',
                'Their privacy practices or terms of use;',
                'Any products, services, or advertisements offered by such third parties.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Visiting these external sites is at your own risk, and you should review their respective terms and policies before engaging with them.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">7. Disclaimer of Warranties</h2>
            <p className="text-sm leading-relaxed">
              The Site and all its content are provided on an &quot;as is&quot; and &quot;as available&quot; basis without any warranties of any kind. We make no representations or guarantees that:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'The Site will be uninterrupted, secure, or error-free;',
                'The information provided is accurate, complete, or up to date;',
                'Any defects will be corrected, or the Site will remain available at all times.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              To the fullest extent permitted by law, we disclaim all implied warranties, including but not limited to merchantability, fitness for a particular purpose, and non-infringement. If you rely on any information obtained from the Site, you do so at your own risk.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">8. Limitation of Liability</h2>
            <p className="text-sm leading-relaxed">
              To the maximum extent permitted by applicable law, neither the Site owner nor its affiliates, employees, or partners shall be liable for any damages arising from your use of or inability to use the Site, including:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Direct, indirect, incidental, or consequential losses;',
                'Loss of profits, data, or goodwill;',
                'Unauthorized access to or alteration of your data.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Your sole and exclusive remedy is to discontinue use of the Site.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">9. Indemnification</h2>
            <p className="text-sm leading-relaxed">
              You agree to defend, indemnify, and hold harmless the Site owner, its affiliates, officers, employees, and agents from any claims, liabilities, damages, losses, or expenses (including reasonable legal fees) arising out of:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Your use or misuse of the Site;',
                'Violation of these Terms;',
                'Violation of any third-party rights, including intellectual property or privacy.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Section 10 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">10. No Gambling or Betting Services</h2>
            <p className="text-sm leading-relaxed">
              The Site is strictly for informational and educational purposes only. We do not promote or facilitate online gambling, betting, or wagering in any form. Any references to gaming results, statistics, or outcomes are purely informational. Users are responsible for ensuring compliance with local laws and regulations related to gaming or betting.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">11. Termination</h2>
            <p className="text-sm leading-relaxed">
              We may suspend or terminate access to the Site, without prior notice, if we believe you have violated these Terms or engaged in any unauthorized or harmful activity. Upon termination, your right to use the Site immediately ceases.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">12. Governing Law and Jurisdiction</h2>
            <p className="text-sm leading-relaxed">
              These Terms are governed by and construed in accordance with the laws of India, without regard to conflict of law principles. You agree that all disputes shall be subject to the exclusive jurisdiction of the courts located within India.
            </p>
          </section>

          {/* Section 13 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">13. Severability</h2>
            <p className="text-sm leading-relaxed">
              If any provision of these Terms is found to be invalid or unenforceable under applicable law, such provision shall be deemed modified to the extent necessary to make it enforceable, while the remaining provisions shall remain in full effect.
            </p>
          </section>

          {/* Section 14 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">14. Entire Agreement</h2>
            <p className="text-sm leading-relaxed">
              These Terms constitute the entire agreement between you and the Site owner regarding your use of the Site, superseding any prior agreements or understandings.
            </p>
          </section>

          {/* Section 15 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">15. Contact Information</h2>
            <p className="text-sm leading-relaxed">
              For any questions, feedback, or concerns related to these Terms and Conditions, please contact:
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

          {/* Section 16 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">16. Acknowledgment</h2>
            <p className="text-sm leading-relaxed">
              By continuing to use the Site, you acknowledge that you have read, understood, and agree to abide by these Terms and Conditions. You also acknowledge your responsibility to comply with all applicable laws and to review this document periodically for updates.
            </p>
          </section>

        </article>
      </main>
    </div>
  )
}
