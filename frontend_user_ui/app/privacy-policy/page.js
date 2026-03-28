import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy – REDDYMATKA',
  description: 'Read the Privacy Policy for REDDYMATKA.com to understand how we collect, use, and protect your personal information.',
}

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa] pb-10">
      {/* Header */}
      <header className="relative flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <Link href="/profile">
          <img src="/images/back-btn.png" alt="Back" className="h-5 w-5" />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">Privacy Policy</h1>
        <div className="h-5 w-5" />
      </header>

      <main className="mx-auto w-full max-w-[430px]">
        <article className="space-y-6 bg-white px-5 py-6 shadow-sm text-[#333]">

          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">1. Information We Collect</h2>
            <p className="text-sm leading-relaxed">
              We may collect and process the following types of information from you:
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#111]">a. Personal Information</h3>
              <p className="text-sm leading-relaxed">
                When you voluntarily provide it, we may collect personal details such as:
              </p>
              <ul className="space-y-1 pl-4">
                {['Name', 'Email address', 'Contact number or other identifying information'].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-relaxed">This data is typically collected when you:</p>
              <ul className="space-y-1 pl-4">
                {[
                  'Fill out contact or registration forms',
                  'Subscribe to newsletters or updates',
                  'Communicate with us directly',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#111]">b. Usage Data</h3>
              <p className="text-sm leading-relaxed">
                We automatically collect certain information about your visit, including:
              </p>
              <ul className="space-y-1 pl-4">
                {[
                  'IP address and device information',
                  'Browser type and version',
                  'Operating system',
                  'Pages visited, time spent on each page, and referring URLs',
                  'General location (based on IP address)',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-relaxed">
                This information helps us understand how users interact with our Site and improve our services.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[#111]">c. Cookies and Tracking Technologies</h3>
              <p className="text-sm leading-relaxed">
                Our Site uses cookies, web beacons, and similar technologies to enhance your browsing experience and analyze website traffic. Cookies allow us to:
              </p>
              <ul className="space-y-1 pl-4">
                {[
                  'Store your preferences',
                  'Personalize content',
                  'Recognize repeat visitors',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-relaxed">
                You can modify your browser settings to refuse cookies or alert you when cookies are being used. However, disabling cookies may limit certain functionalities of the Site.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">2. How We Use Your Information</h2>
            <p className="text-sm leading-relaxed">
              We may use the collected information for the following purposes:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'To operate, maintain, and improve the functionality of our Site',
                'To personalize user experience and deliver content relevant to your interests',
                'To analyze trends, monitor usage, and optimize performance',
                'To communicate with you, respond to inquiries, and provide customer support',
                'To send you administrative messages, updates, or promotional content (where permitted)',
                'To protect against fraud, unauthorized access, or illegal activities',
                'To comply with legal obligations and enforce our Terms and Conditions',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">3. Disclosure of Information</h2>
            <p className="text-sm leading-relaxed">
              We do not sell, rent, or trade your personal information to third parties. We may share your information only under the following circumstances:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'With your consent: When you have explicitly agreed to share your information.',
                'Legal requirements: When disclosure is required by law, regulation, or legal process.',
                'Protection of rights: To enforce our Terms, protect our property, or defend against legal claims.',
                'Service providers: With trusted third-party vendors who assist us in operating the Site or performing services on our behalf (e.g., analytics, hosting, or email communication), subject to confidentiality agreements.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">4. Data Retention</h2>
            <p className="text-sm leading-relaxed">
              We retain personal information only as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law. When data is no longer needed, it will be securely deleted or anonymized.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">5. Data Security</h2>
            <p className="text-sm leading-relaxed">
              We implement appropriate technical and organizational measures to safeguard your information against:
            </p>
            <ul className="space-y-1 pl-4">
              {[
                'Unauthorized access or disclosure',
                'Alteration, loss, or destruction',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              While we strive to protect your data, please note that no online transmission or storage system can be completely secure. Use of the Site is at your own risk.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base font-black text-[#111]">6. Your Data Rights</h2>
            <p className="text-sm leading-relaxed">
              Depending on your jurisdiction, you may have certain rights regarding your personal data, including the right to:
            </p>
            <ul className="space-y-2 pl-4">
              {[
                'Access and review the information we hold about you',
                'Request correction or deletion of your data',
                'Withdraw consent for processing (where applicable)',
                'Opt-out of receiving promotional communications',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8960c]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              You may exercise these rights by contacting us at{' '}
              <a href="mailto:support@REDDYMATKA.com" className="font-semibold text-[#c8960c] underline underline-offset-2">
                support@REDDYMATKA.com
              </a>
              .
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">7. Third-Party Links</h2>
            <p className="text-sm leading-relaxed">
              Our Site may contain links to third-party websites or services that are not operated or controlled by us. We are not responsible for the privacy practices or content of such external sites. We encourage you to review their privacy policies before providing any personal information.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">8. Children&apos;s Privacy</h2>
            <p className="text-sm leading-relaxed">
              This Site is not intended for individuals under the age of 18. We do not knowingly collect personal information from minors. If we become aware that data from anyone under 18 has been collected, we will delete it promptly.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">9. Changes to This Privacy Policy</h2>
            <p className="text-sm leading-relaxed">
              We reserve the right to update or modify this Privacy Policy at any time without prior notice. Changes take effect immediately upon posting the revised version on this page. We encourage you to review this Policy periodically to stay informed about how we protect your data.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">10. Contact Us</h2>
            <p className="text-sm leading-relaxed">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
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

          {/* Section 11 */}
          <section className="space-y-2">
            <h2 className="text-base font-black text-[#111]">11. Acknowledgment</h2>
            <p className="text-sm leading-relaxed">
              By accessing or using this Site, you acknowledge that you have read and understood this Privacy Policy and agree to its terms.
            </p>
          </section>

        </article>
      </main>
    </div>
  )
}
