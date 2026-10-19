'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetchJson } from '../../../utils/api';
import { DEFAULT_PROJECT_ID } from '../../../utils/projectConfig';
import styles from './page.module.css';

function ProjectShowAllPageContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id') || DEFAULT_PROJECT_ID;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedIterations, setExpandedIterations] = useState({});
  const [expandedAnalysis, setExpandedAnalysis] = useState({});
  const [groupGeneratedHeights, setGroupGeneratedHeights] = useState({});
  const generatedColumnRefs = useRef({});

  useEffect(() => {
    if (!projectId) return;

    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const payload = await apiFetchJson(`/project/${projectId}/showall`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        setData(payload);

        const defaults = {};
        (payload.iterations || []).forEach((it) => {
          defaults[it.iteration_id] = true;
        });
        setExpandedIterations(defaults);
      } catch (e) {
        if (e.name !== 'AbortError') {
          setError(e.message || 'Failed to load project data');
        }

      } finally {
        setLoading(false);
      }


    };

    load();
    return () => controller.abort();
  }, [projectId]);

  const totalGenerated = useMemo(() => {
    if (!data?.iterations) return 0;
    return data.iterations.reduce((count, iteration) => {
      return (
        count +
        (iteration.groups || []).reduce((groupCount, group) => {
          return groupCount + (group.generated_images || []).length;
        }, 0)
      );
    }, 0);
  }, [data]);

  useEffect(() => {
    const refs = generatedColumnRefs.current;
    const observers = [];

    const updateHeight = (groupKey, element) => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (!height) return;

      setGroupGeneratedHeights((prev) => {
        if (prev[groupKey] === height) {
          return prev;
        }
        return {
          ...prev,
          [groupKey]: height,
        };
      });
    };

    Object.entries(refs).forEach(([groupKey, element]) => {
      if (!element) return;

      updateHeight(groupKey, element);

      const observer = new ResizeObserver(() => {
        updateHeight(groupKey, element);
      });

      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [data, expandedIterations, expandedAnalysis]);

  const toggleIteration = (iterationId) => {
    setExpandedIterations((prev) => ({
      ...prev,
      [iterationId]: !prev[iterationId],
    }));
  };

  const toggleGroupAnalysis = (groupKey) => {
    setExpandedAnalysis((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const renderReferenceItems = (references) => {
    if (!Array.isArray(references) || references.length === 0) {
      return <div className={styles.groupEmpty}>No references in user_log.</div>;
    }

    return references.map((item, index) => (
      <article key={`${item.aspectName || 'aspect'}-${index}`} className={styles.chosenStyleBox}>
        <div className={styles.selectableContent}>
          <h4 className={styles.referenceAspectName}>{item.aspectName || `Reference ${index + 1}`}</h4>
          <p className={styles.conceptualDescription}>{item.description || 'No description.'}</p>
          {Array.isArray(item.relatedTechnicalAspects) && item.relatedTechnicalAspects.length > 0 && (
            <div className={styles.relatedAspects}>
              {item.relatedTechnicalAspects.map((aspect, aspectIndex) => (
                <span key={`${aspect}-${aspectIndex}`} className={styles.relatedAspectGray}>
                  {aspect}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    ));
  };

  const renderStyleAnalysis = (styleAnalysis) => {
    if (!styleAnalysis || typeof styleAnalysis !== 'object') {
      return <div className={styles.groupEmpty}>No style analysis found.</div>;
    }

    const titleize = (value) => value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

    const conceptual = styleAnalysis.conceptual_aspect || {};
    const technical = styleAnalysis.technical_aspect || {};

    const conceptualEntries = Object.entries(conceptual);
    const technicalEntries = Object.entries(technical);

    return (
      <>
        <h5 className={styles.analysisSectionTitle}>Conceptual Aspect</h5>
        {conceptualEntries.length === 0 ? (
          <div className={styles.groupEmpty}>No conceptual aspect found.</div>
        ) : (
          conceptualEntries.map(([key, value]) => (
            <div key={`conceptual-${key}`} className={styles.analysisGroupBlock}>
              <h6 className={styles.analysisGroupTitle}>{titleize(key)}</h6>
              {Array.isArray(value) && value.length > 0 ? (
                value.map((item, idx) => {
                  const description = typeof item === 'string' ? item : item?.description || '';
                  const relatedAspects = Array.isArray(item?.related_aspects) ? item.related_aspects : [];
                  return (
                    <article key={`conceptual-item-${key}-${idx}`} className={styles.conceptualDetailBox}>
                      <div className={styles.selectableContent}>
                        <p className={styles.conceptualDescription}>{description || 'No description.'}</p>
                        {relatedAspects.length > 0 && (
                          <div className={styles.relatedAspects}>
                            {relatedAspects.map((aspect, aspectIdx) => (
                              <span key={`${aspect}-${aspectIdx}`} className={styles.relatedAspect}>
                                {aspect}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className={styles.groupEmpty}>No conceptual details.</div>
              )}
            </div>
          ))
        )}

        <h5 className={styles.analysisSectionTitle}>Technical Aspect</h5>
        {technicalEntries.length === 0 ? (
          <div className={styles.groupEmpty}>No technical aspect found.</div>
        ) : (
          technicalEntries.map(([key, value]) => (
            <div key={`technical-${key}`} className={styles.analysisGroupBlock}>
              <h6 className={styles.analysisGroupTitle}>{titleize(key)}</h6>
              {Array.isArray(value) && value.length > 0 ? (
                value.map((item, idx) => (
                  <article key={`technical-item-${key}-${idx}`} className={styles.technicalDetailBox}>
                    <div className={styles.selectableContent}>
                      <p className={styles.technicalDescription}>{typeof item === 'string' ? item : JSON.stringify(item, null, 2)}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className={styles.groupEmpty}>No technical details.</div>
              )}
            </div>
          ))
        )}
      </>
    );
  };

  const renderGeneratedStyleDescription = (styleDescription) => {
    if (!styleDescription || typeof styleDescription !== 'object') {
      return <p className={styles.technicalDescription}>No style description.</p>;
    }

    const focus = Array.isArray(styleDescription.focus) ? styleDescription.focus : [];

    return (
      <div className={styles.structuredDescription}>
        {focus.length > 0 && (
          <div className={styles.focusSection}>
            {focus.map((aspect, index) => (
              <span key={`${aspect}-${index}`} className={styles.focusAspect}>
                {aspect}
              </span>
            ))}
          </div>
        )}

        {styleDescription.modify_description && (
          <p className={styles.descriptionSection}>
            <strong>Modify:</strong> {styleDescription.modify_description}
          </p>
        )}

        {styleDescription.target_effect && (
          <p className={styles.targetEffectSection}>
            <strong>Target Effect:</strong> {styleDescription.target_effect}
          </p>
        )}

        {styleDescription.description && (
          <p className={styles.descriptionSection}>
            <strong>Description:</strong> {styleDescription.description}
          </p>
        )}
      </div>
    );
  };

  const renderFeedback = (feedback) => {
    if (!feedback || typeof feedback !== 'object') {
      return null;
    }

    const agentOrder = [
      { key: 'fansAgent', label: 'Fan' },
      { key: 'trendingAgent', label: 'Trending Audience' },
      { key: 'professionalAgent', label: 'Professional Artist' },
    ];

    const getValue = (obj, keys) => {
      for (const key of keys) {
        const value = obj?.[key];
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
      return '';
    };

    const stringifyValue = (value) => {
      if (Array.isArray(value)) {
        return value.join(' ');
      }
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return String(value || '');
    };

    return (
      <div className={styles.feedbackBlock}>
        {agentOrder.map((agent) => {
          const agentData = feedback[agent.key];
          if (!agentData || typeof agentData !== 'object') {
            return null;
          }

          const summary = stringifyValue(getValue(agentData, ['summary_comment', 'summaryComment', 'summary']));
          const impact = stringifyValue(getValue(agentData, ['predictedImpact', 'impact']));
          const suggestions = stringifyValue(getValue(agentData, ['improvementSuggestions', 'suggestions']));

          return (
            <article key={agent.key} className={styles.feedbackAgentCard}>
              <h5 className={styles.feedbackAgentName}>{agent.label}</h5>
              <div className={styles.feedbackDetailBlock}>
                <h6 className={styles.feedbackDetailSubtitle}>Summary</h6>
                <p className={styles.feedbackDetailText}>{summary || 'No summary.'}</p>
              </div>
              <div className={styles.feedbackDetailBlock}>
                <h6 className={styles.feedbackDetailSubtitle}>Impact</h6>
                <p className={styles.feedbackDetailText}>{impact || 'No impact.'}</p>
              </div>
              <div className={styles.feedbackDetailBlock}>
                <h6 className={styles.feedbackDetailSubtitle}>Suggestions</h6>
                <p className={styles.feedbackDetailText}>{suggestions || 'No suggestions.'}</p>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <main className={styles.page}>Loading project gallery...</main>;
  }

  if (error) {
    return <main className={styles.page}>Error: {error}</main>;
  }

  const iterations = data?.iterations || [];

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <h1>Project {projectId} - All Results</h1>
        <p>
          Iterations: {iterations.length} | Successful generated images: {totalGenerated}
        </p>
      </section>

      {iterations.length === 0 ? (
        <section className={styles.empty}>No iterations found for this project.</section>
      ) : (
        <section className={styles.iterations}>
          {iterations.map((iteration) => {
            const isExpanded = expandedIterations[iteration.iteration_id] ?? true;
            const groupCount = (iteration.groups || []).length;

            return (
              <article key={iteration.iteration_id} className={styles.iterationCard}>
                <button
                  type="button"
                  className={styles.iterationHeader}
                  onClick={() => toggleIteration(iteration.iteration_id)}
                >
                  <span>Iteration {iteration.iteration_id}</span>
                  <span>
                    {groupCount} groups {isExpanded ? '[-]' : '[+]'}
                  </span>
                </button>

                {isExpanded && (
                  <div className={styles.groupsWrap}>
                    {groupCount === 0 ? (
                      (() => {
                        const latestAssets = iteration.latest_assets || {};
                        const latestReference = latestAssets.reference_image || null;
                        const latestUser = latestAssets.user_image || null;
                        const fallbackAnalysisKey = `fallback-${iteration.iteration_id}`;

                        if (!latestReference?.url && !latestUser?.url) {
                          return <div className={styles.groupEmpty}>No successful generated images in this iteration.</div>;
                        }

                        return (
                          <section className={styles.groupCard}>
                            <div className={styles.groupCardInner}>
                              <div className={styles.leftImageColumn}>
                                <h3 className={styles.groupTitle}>Latest Images</h3>

                                <div className={styles.sideImagePanel}>
                                  <h4>
                                    Reference Image (ID: {latestReference?.image_id ?? 'N/A'})
                                  </h4>
                                  {latestReference?.url ? (
                                    <img
                                      src={`/api${latestReference.url}`}
                                      alt={`Reference image ${latestReference.image_id}`}
                                      loading="lazy"
                                      className={styles.sideImage}
                                    />
                                  ) : (
                                    <div className={styles.missing}>Not found</div>
                                  )}

                                  <button
                                    type="button"
                                    className={styles.analysisToggle}
                                    onClick={() => toggleGroupAnalysis(fallbackAnalysisKey)}
                                  >
                                    {expandedAnalysis[fallbackAnalysisKey] ? 'Hide Style Analysis' : 'Show Style Analysis'}
                                  </button>

                                  {expandedAnalysis[fallbackAnalysisKey] && (
                                    <div className={styles.analysisBox}>{renderStyleAnalysis(latestAssets.style_analysis)}</div>
                                  )}
                                </div>

                                <div className={styles.sideImagePanel}>
                                  <h4>User Image (ID: {latestUser?.image_id ?? 'N/A'})</h4>
                                  {latestUser?.url ? (
                                    <img
                                      src={`/api${latestUser.url}`}
                                      alt={`User image ${latestUser.image_id}`}
                                      loading="lazy"
                                      className={styles.sideImage}
                                    />
                                  ) : (
                                    <div className={styles.missing}>Not found</div>
                                  )}
                                </div>
                              </div>

                              <div className={styles.groupMetaColumn}>
                                <h4 className={styles.referencesTitle}>Chosen Style</h4>
                                <div className={styles.groupEmpty}>No generated result for this iteration.</div>
                              </div>

                              <div className={styles.generatedColumn}>
                                <h4>Generated Images</h4>
                                <div className={styles.groupEmpty}>No successful generated images in this iteration.</div>
                              </div>
                            </div>
                          </section>
                        );
                      })()
                    ) : (
                      (iteration.groups || []).map((group) => (
                        <section key={group.group_key} className={styles.groupCard}>
                          <div className={styles.groupCardInner}>
                            {(() => {
                              const groupDomKey = `${iteration.iteration_id}-${group.group_key}`;
                              const syncedHeight = groupGeneratedHeights[groupDomKey];
                              const syncedColumnStyle = syncedHeight
                                ? { maxHeight: `${syncedHeight}px` }
                                : undefined;

                              return (
                                <>
                            <div className={styles.leftImageColumn} style={syncedColumnStyle}>
                              <h3 className={styles.groupTitle}>Group {group.group_key}</h3>
                              <div className={styles.sideImagePanel}>
                                <h4>
                                  Reference Image (ID: {group.reference_image?.image_id ?? 'N/A'})
                                </h4>
                                {group.reference_image?.url ? (
                                  <img
                                    src={`/api${group.reference_image.url}`}
                                    alt={`Reference image ${group.reference_image.image_id}`}
                                    loading="lazy"
                                    className={styles.sideImage}
                                  />
                                ) : (
                                  <div className={styles.missing}>Not found</div>
                                )}

                                <button
                                  type="button"
                                  className={styles.analysisToggle}
                                  onClick={() => toggleGroupAnalysis(group.group_key)}
                                >
                                  {expandedAnalysis[group.group_key] ? 'Hide Style Analysis' : 'Show Style Analysis'}
                                </button>

                                {expandedAnalysis[group.group_key] && (
                                  <div className={styles.analysisBox}>{renderStyleAnalysis(group.style_analysis)}</div>
                                )}
                              </div>

                              <div className={styles.sideImagePanel}>
                                <h4>User Image (ID: {group.user_image?.image_id ?? 'N/A'})</h4>
                                {group.user_image?.url ? (
                                  <img
                                    src={`/api${group.user_image.url}`}
                                    alt={`User image ${group.user_image.image_id}`}
                                    loading="lazy"
                                    className={styles.sideImage}
                                  />
                                ) : (
                                  <div className={styles.missing}>Not found</div>
                                )}
                              </div>
                            </div>

                            <div className={styles.groupMetaColumn} style={syncedColumnStyle}>
                              <h4 className={styles.referencesTitle}>Chosen Style</h4>
                              <div className={styles.referencesList}>
                                {renderReferenceItems(group.user_log?.references)}
                              </div>
                            </div>

                            <div
                              className={styles.generatedColumn}
                              ref={(element) => {
                                if (element) {
                                  generatedColumnRefs.current[groupDomKey] = element;
                                } else {
                                  delete generatedColumnRefs.current[groupDomKey];
                                }
                              }}
                            >
                            <h4>Generated Images</h4>
                            <div className={styles.generatedGrid}>
                              {(group.generated_images || []).map((image) => (
                                <figure key={image.generated_image_id} className={styles.generatedItem}>
                                  <div className={styles.generatedRow}>
                                    <div className={styles.generatedImagePane}>
                                      <div className={styles.generatedImageTopRow}>
                                        <div className={styles.generatedIdLabel}>ID: {image.generated_image_id}</div>
                                        {image.has_feedback && <span className={styles.feedbackBadgeInline}>Feedback</span>}
                                      </div>

                                      <img
                                        src={`/api${image.url}`}
                                        alt={`Generated image ${image.generated_image_id}`}
                                        loading="lazy"
                                        className={styles.generatedImage}
                                      />
                                      <a
                                        href={`/api${image.download_url}`}
                                        download
                                        target="_blank"
                                        rel="noreferrer"
                                        className={styles.imageDownloadLink}
                                      >
                                        Download image
                                      </a>
                                    </div>

                                    <div className={styles.generatedMeta}>
                                      {renderGeneratedStyleDescription(image.style_description)}
                                      {image.has_feedback && renderFeedback(image.feedback)}
                                    </div>
                                  </div>
                                </figure>
                              ))}
                            </div>
                          </div>
                                </>
                              );
                            })()}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

export default function ProjectShowAllPage() {
  return (
    <Suspense fallback={<div>Loading project history...</div>}>
      <ProjectShowAllPageContent />
    </Suspense>
  );
}
